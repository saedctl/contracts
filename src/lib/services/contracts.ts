import "server-only";
import { config, productionBlockers } from "../config";
import { getStore } from "../db";
import { findUnfilled, renderTemplate } from "../template";
import { applyDemoSignature, generateContractPdf, type ContractLayout, type DemoSignature } from "../pdf";
import { signingUrl, parseSigningToken, verifySigningMac } from "../signing-link";
import * as ds from "../esign/dropbox-sign";
import { sendEmail } from "../email/send";
import { businessCopyEmail, signatureConfirmationEmail, signatureRequestEmail } from "../email/templates";
import type { Contract, ContractStatus, StaffUser, TemplateVersion } from "../types";
import { formatLongDate, randomToken, sha256Hex } from "../utils";
import type { ContractInput } from "../validation";
import type { RequestMeta } from "../request";
import { buildFieldValues } from "./fields";
import { audit } from "./audit";

export class UserFacingError extends Error {}

export const CONSENT_STATEMENT =
  "I agree to sign this agreement electronically. I understand that my electronic signature has the same effect as a handwritten signature, and that I can request a paper copy from The Engineers Club.";

// ---------------------------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------------------------

export function canAccess(user: StaffUser, contract: Contract): boolean {
  return user.role === "admin" || contract.createdBy === user.id;
}

export async function getContractForStaff(user: StaffUser, id: string): Promise<Contract | null> {
  const store = await getStore();
  const c = await store.getContract(id);
  if (!c || !canAccess(user, c)) return null;
  return expireIfDue(c);
}

export async function listContractsForStaff(user: StaffUser, filter: { q?: string; status?: ContractStatus }) {
  const store = await getStore();
  const list = await store.listContracts({ ...filter, createdBy: user.role === "admin" ? undefined : user.id });
  return Promise.all(list.map(expireIfDue));
}

async function expireIfDue(c: Contract): Promise<Contract> {
  if ((c.status === "sent" || c.status === "viewed") && c.linkExpiresAt && new Date(c.linkExpiresAt) < new Date()) {
    const updated = await (await getStore()).updateContract(c.id, { status: "expired" });
    await audit(c.id, { type: "system" }, "contract.expired", { expiredAt: c.linkExpiresAt });
    return updated;
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------------------------

async function requireTemplate(): Promise<TemplateVersion> {
  const t = await (await getStore()).getActiveTemplate();
  if (!t) throw new UserFacingError("No contract template has been set up yet. An administrator needs to upload the master template first.");
  if (t.isSample && !config.demoMode) throw new UserFacingError("The sample template cannot be used for real contracts. Upload your approved agreement first.");
  const unfilled = findUnfilled(t.body);
  if (unfilled.length) {
    throw new UserFacingError(`The contract template still contains ${unfilled.join(", ")}. An administrator needs to fill these in on the Template page and save a new version.`);
  }
  return t;
}

export async function previewContract(input: ContractInput) {
  const template = await requireTemplate();
  const fieldValues = buildFieldValues(input, "TEC-PREVIEW");
  return { template, fieldValues, blocks: renderTemplate(template.body, fieldValues) };
}

export async function previewPdf(input: ContractInput): Promise<Uint8Array> {
  const { template, fieldValues, blocks } = await previewContract(input);
  const { bytes } = await generateContractPdf({
    blocks, reference: fieldValues.contract_reference, templateVersion: template.version, customerName: input.customerName,
    customerEmail: input.customerEmail, issuedAt: new Date(), textTags: false, demo: config.demoMode, preview: true,
  });
  return bytes;
}

function esignProvider() {
  return config.dropboxSign ? ("dropbox_sign" as const) : ("demo" as const);
}

export async function createContract(user: StaffUser, input: ContractInput, meta: RequestMeta): Promise<Contract> {
  const blockers = productionBlockers();
  if (blockers.length) throw new UserFacingError(`Setup incomplete — ${blockers[0]}. See the setup guide in README.md.`);
  const store = await getStore();
  const template = await requireTemplate();
  const reference = await store.nextReference();
  const issuedAt = new Date();
  const fieldValues = buildFieldValues(input, reference, issuedAt.toISOString().slice(0, 10));
  const provider = esignProvider();

  const { bytes, layout } = await generateContractPdf({
    blocks: renderTemplate(template.body, fieldValues), reference, templateVersion: template.version,
    customerName: input.customerName, customerEmail: input.customerEmail, issuedAt,
    textTags: provider === "dropbox_sign", demo: provider === "demo",
  });
  const documentSha256 = sha256Hex(bytes);

  const retention = new Date(input.endDate);
  retention.setUTCFullYear(retention.getUTCFullYear() + config.retentionYears);

  const contract = await store.insertContract({
    reference,
    createdBy: user.id,
    status: "draft",
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    durationMonths: input.duration === "custom" ? null : Number(input.duration),
    durationLabel: fieldValues.membership_duration,
    startDate: input.startDate,
    endDate: input.endDate,
    amountPaid: input.amountPaid,
    currency: input.currency,
    paymentStatus: input.paymentStatus,
    paymentSchedule: input.paymentSchedule || null,
    outstandingBalance: input.outstandingBalance ?? 0,
    templateVersionId: template.id,
    fieldValues,
    documentPath: null,
    documentSha256,
    signedDocumentPath: null,
    signedDocumentSha256: null,
    esignProvider: provider,
    providerRequestId: null,
    providerSignatureId: null,
    providerData: provider === "demo" ? { layout } : null,
    linkNonce: randomToken(),
    linkExpiresAt: null,
    sentAt: null,
    viewedAt: null,
    consentAt: null,
    signedAt: null,
    declinedAt: null,
    confirmationSentAt: null,
    isDemo: provider === "demo",
    retentionUntil: retention.toISOString().slice(0, 10),
    anonymisedAt: null,
  });

  const path = `${contract.id}/agreement-${documentSha256.slice(0, 12)}.pdf`;
  await store.putFile(path, bytes, "application/pdf");
  const saved = await store.updateContract(contract.id, { documentPath: path });
  await audit(contract.id, { type: "staff", user }, "contract.created", {
    reference, templateVersion: template.version, templateSha256: template.bodySha256, documentSha256, provider,
  }, meta);
  return saved;
}

// ---------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------

function linkExpiry(): string {
  return new Date(Date.now() + config.linkTtlDays * 86400_000).toISOString();
}

async function deliverSigningEmail(contract: Contract, attempt: string) {
  const url = signingUrl(contract);
  const email = signatureRequestEmail({
    customerName: contract.customerName, url, expiresOn: formatLongDate(contract.linkExpiresAt!.slice(0, 10)), demo: contract.isDemo,
  });
  return sendEmail({ ...email, to: contract.customerEmail, kind: "signature_request", contractId: contract.id, idempotencyKey: `sigreq:${contract.id}:${attempt}` });
}

export async function sendContract(user: StaffUser, contract: Contract, meta: RequestMeta): Promise<Contract> {
  if (!canAccess(user, contract)) throw new UserFacingError("Contract not found.");
  if (contract.status !== "draft") throw new UserFacingError("This contract has already been sent.");
  const blockers = productionBlockers();
  if (blockers.length) throw new UserFacingError(`Setup incomplete — ${blockers[0]}.`);
  const store = await getStore();

  let c = contract;
  if (c.esignProvider === "dropbox_sign" && !c.providerRequestId) {
    const pdf = await store.getFile(c.documentPath!);
    if (!pdf || sha256Hex(pdf) !== c.documentSha256) throw new Error("Stored agreement is missing or does not match its fingerprint.");
    try {
      const res = await ds.createEmbeddedSignatureRequest({
        pdf,
        filename: `${c.reference} Membership Agreement.pdf`,
        title: `Membership Agreement ${c.reference}`,
        subject: "Your Engineers Club Membership Agreement",
        message: "Please review and sign your membership agreement.",
        signerName: c.customerName,
        signerEmail: c.customerEmail,
        metadata: { contract_id: c.id, reference: c.reference, document_sha256: c.documentSha256 ?? "" },
      });
      c = await store.updateContract(c.id, { providerRequestId: res.signatureRequestId, providerSignatureId: res.signatureId });
    } catch (e) {
      await audit(c.id, { type: "provider", label: "Dropbox Sign" }, "provider.error", { stage: "create", message: (e as Error).message });
      throw new UserFacingError(`The e-signature provider rejected the request: ${(e as Error).message}`);
    }
  }

  c = await store.updateContract(c.id, { linkExpiresAt: linkExpiry() });
  const result = await deliverSigningEmail(c, "initial");
  c = await store.updateContract(c.id, { status: "sent", sentAt: new Date().toISOString() });
  await audit(c.id, { type: "staff", user }, "contract.sent", { to: c.customerEmail, emailSimulated: result.simulated, expiresAt: c.linkExpiresAt }, meta);
  return c;
}

export async function resendContract(user: StaffUser, contract: Contract, meta: RequestMeta): Promise<Contract> {
  if (!canAccess(user, contract)) throw new UserFacingError("Contract not found.");
  if (!["sent", "viewed", "expired"].includes(contract.status)) throw new UserFacingError("Only unsigned contracts that have been sent can be resent.");
  const store = await getStore();
  // A resend issues a fresh link (rotating the nonce revokes the old one) with a new expiry.
  let c = await store.updateContract(contract.id, {
    linkNonce: randomToken(),
    linkExpiresAt: linkExpiry(),
    status: contract.status === "expired" ? "sent" : contract.status,
  });
  const result = await deliverSigningEmail(c, c.linkNonce);
  c = await store.updateContract(c.id, { sentAt: new Date().toISOString() });
  await audit(c.id, { type: "staff", user }, "contract.resent", { to: c.customerEmail, emailSimulated: result.simulated }, meta);
  return c;
}

export async function copySigningLink(user: StaffUser, contract: Contract, meta: RequestMeta): Promise<string> {
  if (!canAccess(user, contract)) throw new UserFacingError("Contract not found.");
  if (!["sent", "viewed"].includes(contract.status)) throw new UserFacingError("A signing link is only available while the contract is awaiting signature.");
  await audit(contract.id, { type: "staff", user }, "contract.link_copied", {}, meta);
  return signingUrl(contract);
}

export async function deleteDraft(user: StaffUser, contract: Contract, meta: RequestMeta) {
  if (!canAccess(user, contract)) throw new UserFacingError("Contract not found.");
  if (contract.status !== "draft") throw new UserFacingError("Only drafts can be deleted.");
  const store = await getStore();
  await audit(contract.id, { type: "staff", user }, "contract.draft_deleted", { reference: contract.reference }, meta);
  if (contract.documentPath) await store.deleteFile(contract.documentPath);
  await store.deleteDraft(contract.id);
}

// ---------------------------------------------------------------------------------------------
// Customer signing (public, token-authenticated)
// ---------------------------------------------------------------------------------------------

export type SigningState =
  | { state: "invalid" }
  | { state: "expired" | "signed" | "declined" | "finalising"; contract: Contract }
  | { state: "ready"; contract: Contract };

export async function resolveSigningToken(token: string): Promise<SigningState> {
  const parsed = parseSigningToken(token);
  if (!parsed) return { state: "invalid" };
  const store = await getStore();
  const found = await store.getContract(parsed.contractId);
  if (!found || found.anonymisedAt || !verifySigningMac(found, parsed.mac)) return { state: "invalid" };
  const c = await expireIfDue(found);
  if (c.status === "signed") return { state: "signed", contract: c };
  if (c.status === "declined") return { state: "declined", contract: c };
  if (c.status === "expired") return { state: "expired", contract: c };
  if (c.status === "draft") return { state: "invalid" };
  // Customer finished in the provider UI; waiting for the provider's verified completion event.
  if (c.consentAt && (c.providerData as { signerCompletedAt?: string } | null)?.signerCompletedAt) return { state: "finalising", contract: c };
  return { state: "ready", contract: c };
}

export async function markViewed(c: Contract, meta: RequestMeta): Promise<Contract> {
  if (c.status !== "sent") return c;
  const updated = await (await getStore()).updateContract(c.id, { status: "viewed", viewedAt: new Date().toISOString() });
  await audit(c.id, { type: "customer", label: c.customerEmail }, "contract.viewed", {}, meta);
  return updated;
}

export async function getContractTemplateBody(c: Contract): Promise<{ body: string; version: number }> {
  const t = await (await getStore()).getTemplateVersion(c.templateVersionId);
  if (!t) throw new Error("Template version missing");
  return { body: t.body, version: t.version };
}

/** Records explicit e-sign consent, then returns what the client needs to open the signer. */
export async function startSigning(c: Contract, meta: RequestMeta): Promise<{ mode: "dropbox_sign"; signUrl: string; clientId: string; testMode: boolean } | { mode: "demo" }> {
  if (c.status !== "sent" && c.status !== "viewed") throw new UserFacingError("This agreement is no longer awaiting signature.");
  const store = await getStore();
  const now = new Date().toISOString();
  await store.updateContract(c.id, { consentAt: now, status: "viewed", viewedAt: c.viewedAt ?? now });
  await audit(c.id, { type: "customer", label: c.customerEmail }, "contract.consent_given", {
    statement: CONSENT_STATEMENT, documentSha256: c.documentSha256, reference: c.reference, consentedAt: now,
  }, meta);

  if (c.esignProvider === "demo") return { mode: "demo" };
  if (!c.providerSignatureId || !config.dropboxSign) throw new UserFacingError("Signing is temporarily unavailable. Please try again later.");
  try {
    const signUrl = await ds.getEmbeddedSignUrl(c.providerSignatureId);
    await audit(c.id, { type: "customer", label: c.customerEmail }, "contract.signing_started", {}, meta);
    return { mode: "dropbox_sign", signUrl, clientId: config.dropboxSign.clientId, testMode: config.dropboxSign.testMode };
  } catch (e) {
    await audit(c.id, { type: "provider", label: "Dropbox Sign" }, "provider.error", { stage: "sign_url", message: (e as Error).message });
    // The request may already be complete (e.g. signed in another tab): reconcile.
    await syncFromProvider(c.id).catch(() => undefined);
    throw new UserFacingError("We couldn't open the signing panel. Please refresh the page and try again.");
  }
}

/**
 * The browser reports that the signer finished in the provider UI. This is NOT treated as
 * completion: it only lets the page show "finalising" and triggers a provider-side check.
 */
export async function signerReportedComplete(c: Contract) {
  if (c.esignProvider !== "dropbox_sign") return;
  const store = await getStore();
  await store.updateContract(c.id, { providerData: { ...(c.providerData ?? {}), signerCompletedAt: new Date().toISOString() } });
  await syncFromProvider(c.id).catch((e) => console.error("sync after sign failed", e));
}

export async function completeDemoSignature(c: Contract, sig: DemoSignature, meta: RequestMeta) {
  if (c.esignProvider !== "demo" || !c.isDemo || !config.demoMode) throw new UserFacingError("Simulated signing is only available in demo mode.");
  if (c.status !== "viewed" || !c.consentAt) throw new UserFacingError("Please confirm your consent to sign electronically first.");
  const store = await getStore();
  const unsigned = await store.getFile(c.documentPath!);
  if (!unsigned) throw new Error("Document missing");
  const signedAt = new Date().toISOString();
  const layout = (c.providerData as { layout: ContractLayout }).layout;
  const signed = await applyDemoSignature(unsigned, layout, sig, [
    { label: "Status", value: "SIMULATED (demo mode). No e-signature provider was involved. Not legally binding." },
    { label: "Reference", value: c.reference },
    { label: "Signer name", value: c.customerName },
    { label: "Signer email", value: c.customerEmail },
    { label: "Signature method", value: sig.kind },
    { label: "Consent recorded", value: c.consentAt },
    { label: "Signed at (UTC)", value: signedAt },
    { label: "IP address", value: meta.ip ?? "unknown" },
    { label: "User agent", value: meta.userAgent ?? "unknown" },
    { label: "Original document SHA-256", value: c.documentSha256 ?? "" },
  ]);
  const sha = sha256Hex(signed);
  const path = `${c.id}/signed-demo-${sha.slice(0, 12)}.pdf`;
  await store.putFile(path, signed, "application/pdf");
  await store.updateContract(c.id, { status: "signed", signedAt, signedDocumentPath: path, signedDocumentSha256: sha });
  await audit(c.id, { type: "customer", label: c.customerEmail }, "contract.signed_demo", { method: sig.kind, signedSha256: sha, simulated: true }, meta);
  await sendConfirmations(c.id);
}

// ---------------------------------------------------------------------------------------------
// Provider reconciliation (webhooks + manual refresh)
// ---------------------------------------------------------------------------------------------

function summariseRequest(sr: ds.DSSignatureRequest) {
  const s = sr.signatures[0];
  return {
    signatureRequestId: sr.signature_request_id,
    testMode: sr.test_mode,
    isComplete: sr.is_complete,
    isDeclined: sr.is_declined,
    createdAt: new Date(sr.created_at * 1000).toISOString(),
    signer: s && {
      signatureId: s.signature_id,
      name: s.signer_name,
      email: s.signer_email_address,
      statusCode: s.status_code,
      signedAt: s.signed_at ? new Date(s.signed_at * 1000).toISOString() : null,
      lastViewedAt: s.last_viewed_at ? new Date(s.last_viewed_at * 1000).toISOString() : null,
      declineReason: s.decline_reason ?? null,
    },
  };
}

/** Pulls authoritative state from Dropbox Sign. Idempotent and safe to call repeatedly. */
export async function syncFromProvider(contractId: string): Promise<Contract> {
  const store = await getStore();
  let c = await store.getContract(contractId);
  if (!c) throw new Error("Contract not found");
  if (c.esignProvider !== "dropbox_sign" || !c.providerRequestId) return c;

  if (c.status !== "signed" || !c.signedDocumentPath) {
    const sr = await ds.getSignatureRequest(c.providerRequestId);
    if (sr.metadata?.contract_id && sr.metadata.contract_id !== c.id) throw new Error("Provider request does not belong to this contract");
    const summary = summariseRequest(sr);
    const signer = sr.signatures[0];
    const providerData = { ...(c.providerData ?? {}), ...summary };

    if (c.status !== "signed" && sr.is_complete && signer?.status_code === "signed") {
      // Only now — provider-confirmed completion — is the contract marked signed.
      c = await store.updateContract(c.id, { status: "signed", signedAt: summary.signer!.signedAt ?? new Date().toISOString(), providerData });
      await audit(c.id, { type: "provider", label: "Dropbox Sign" }, "contract.signed", {
        signer: summary.signer, testMode: sr.test_mode, documentSha256: c.documentSha256,
      });
    } else if (c.status !== "signed" && (sr.is_declined || signer?.status_code === "declined")) {
      if (c.status !== "declined") {
        c = await store.updateContract(c.id, { status: "declined", declinedAt: new Date().toISOString(), providerData });
        await audit(c.id, { type: "provider", label: "Dropbox Sign" }, "contract.declined", { reason: summary.signer?.declineReason });
      }
    } else if (c.status === "sent" && signer?.last_viewed_at) {
      c = await store.updateContract(c.id, { status: "viewed", viewedAt: summary.signer!.lastViewedAt ?? new Date().toISOString(), providerData });
    }

    if (c.status === "signed" && !c.signedDocumentPath) {
      const pdf = await ds.downloadSignedPdf(c.providerRequestId!);
      if (pdf) {
        const sha = sha256Hex(pdf);
        const path = `${c.id}/signed-${sha.slice(0, 12)}.pdf`;
        try {
          await store.putFile(path, pdf, "application/pdf");
        } catch (e) {
          // A concurrent webhook already stored the identical file.
          if (!(await store.getFile(path))) throw e;
        }
        const fresh = await store.getContract(c.id);
        if (fresh && !fresh.signedDocumentPath) {
          c = await store.updateContract(c.id, { signedDocumentPath: path, signedDocumentSha256: sha });
          await audit(c.id, { type: "provider", label: "Dropbox Sign" }, "contract.signed_pdf_stored", { sha256: sha, bytes: pdf.length });
        }
      }
    }
  }

  if (c.status === "signed" && c.signedDocumentPath && !c.confirmationSentAt) await sendConfirmations(c.id);
  return (await store.getContract(c.id))!;
}

async function sendConfirmations(contractId: string) {
  const store = await getStore();
  const c = await store.getContract(contractId);
  if (!c || c.status !== "signed" || !c.signedDocumentPath || c.confirmationSentAt) return;
  const pdf = await store.getFile(c.signedDocumentPath);
  if (!pdf) throw new Error("Signed document missing from storage");
  const filename = `${c.reference} Signed Membership Agreement${c.isDemo ? " (DEMO)" : ""}.pdf`;

  const customer = signatureConfirmationEmail({ customerName: c.customerName, demo: c.isDemo });
  const r1 = await sendEmail({ ...customer, to: c.customerEmail, attachments: [{ filename, content: pdf }], kind: "signature_confirmation", contractId: c.id, idempotencyKey: `confirm:${c.id}` });

  const businessTo = config.businessEmail;
  if (businessTo) {
    const biz = businessCopyEmail({ customerName: c.customerName, customerEmail: c.customerEmail, reference: c.reference, dashboardUrl: `${config.appUrl}/contracts/${c.id}`, demo: c.isDemo });
    await sendEmail({ ...biz, to: businessTo, attachments: [{ filename, content: pdf }], kind: "business_copy", contractId: c.id, idempotencyKey: `bizcopy:${c.id}` });
  }
  await store.updateContract(c.id, { confirmationSentAt: new Date().toISOString() });
  await audit(c.id, { type: "system" }, "contract.confirmation_sent", { to: [c.customerEmail, businessTo].filter(Boolean), simulated: r1.simulated });
}

// ---------------------------------------------------------------------------------------------
// Maintenance (cron)
// ---------------------------------------------------------------------------------------------

export async function runMaintenance() {
  const store = await getStore();
  const all = await store.listContracts({ limit: 100_000 });
  const today = new Date().toISOString().slice(0, 10);
  const draftCutoff = new Date(Date.now() - config.draftRetentionDays * 86400_000).toISOString();
  let expired = 0, deleted = 0, anonymised = 0, reconciled = 0;
  for (const c of all) {
    if (c.status === "draft" && c.createdAt < draftCutoff) {
      if (c.documentPath) await store.deleteFile(c.documentPath);
      await store.deleteDraft(c.id);
      await audit(c.id, { type: "system" }, "contract.draft_deleted", { reason: "retention" });
      deleted++;
      continue;
    }
    if (!c.anonymisedAt && c.retentionUntil && c.retentionUntil < today) {
      for (const p of [c.documentPath, c.signedDocumentPath]) if (p) await store.deleteFile(p);
      await store.anonymiseContract(c.id);
      await audit(c.id, { type: "system" }, "contract.anonymised", { retentionUntil: c.retentionUntil });
      anonymised++;
      continue;
    }
    // Safety net for missed webhooks: reconcile anything awaiting signature with the provider.
    if (c.esignProvider === "dropbox_sign" && c.providerRequestId && (["sent", "viewed"].includes(c.status) || (c.status === "signed" && !c.confirmationSentAt))) {
      await syncFromProvider(c.id).then(() => reconciled++).catch((e) => console.error("reconcile failed", c.id, e));
    }
    if ((await expireIfDue(c)).status !== c.status) expired++;
  }
  return { expired, deleted, anonymised, reconciled };
}
