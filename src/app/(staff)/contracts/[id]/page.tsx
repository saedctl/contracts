import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { getContractForStaff } from "@/lib/services/contracts";
import { EVENT_LABELS } from "@/lib/services/audit";
import { renderTemplate } from "@/lib/template";
import { PAYMENT_STATUS_LABELS } from "@/lib/types";
import { formatDateTime, formatLongDate, formatMoney } from "@/lib/utils";
import { Alert, ButtonLink, Card, StatusBadge } from "@/components/ui";
import { ContractDocument } from "@/components/ContractDocument";
import { ContractActions } from "@/components/contracts/ContractActions";

export const metadata: Metadata = { title: "Contract" };

type Signer = { name?: string; email?: string; signedAt?: string | null; signatureId?: string; statusCode?: string };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const c = await getContractForStaff(user, (await params).id);
  if (!c) notFound();
  const store = await getStore();
  const [events, emails, template] = await Promise.all([
    store.listAuditEvents({ contractId: c.id, limit: 100 }),
    store.listEmailLog({ contractId: c.id }),
    store.getTemplateVersion(c.templateVersionId),
  ]);
  const pd = (c.providerData ?? {}) as { signer?: Signer; testMode?: boolean; signatureRequestId?: string };
  const awaiting = c.status === "sent" || c.status === "viewed";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-[14px] text-muted hover:text-ink">← Back to contracts</Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow">{c.reference}</p>
            <h1 className="mt-2 font-serif text-[28px] font-semibold leading-tight sm:text-[32px]">{c.customerName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[14px] text-muted">
              <StatusBadge status={c.status} demo={c.isDemo} />
              <span>{formatMoney(c.amountPaid, c.currency)} · {c.durationLabel}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.signedDocumentPath && (
              <ButtonLink href={`/api/contracts/${c.id}/document?kind=signed&download=1`} prefetch={false}>Download signed PDF</ButtonLink>
            )}
            {c.documentPath && (
              <ButtonLink href={`/api/contracts/${c.id}/document`} target="_blank" prefetch={false} variant="secondary">Original PDF</ButtonLink>
            )}
          </div>
        </div>
      </div>

      {c.isDemo && (
        <Alert tone="warning">
          <strong>Demo contract.</strong> Signatures and emails for this contract are simulated and not legally binding.
          {awaiting && " Use “Copy signing link” and open it to try the customer signing flow."}
        </Alert>
      )}
      {c.status === "signed" && !c.signedDocumentPath && (
        <Alert>Dropbox Sign has confirmed the signature and is preparing the final PDF. It will appear here automatically.</Alert>
      )}
      {c.anonymisedAt && <Alert>Personal data for this contract was erased on {formatDateTime(c.anonymisedAt)} under the retention policy.</Alert>}

      {c.status !== "signed" && !c.anonymisedAt && (
        <Card className="p-5">
          <ContractActions id={c.id} status={c.status} provider={c.esignProvider} hasSigned={!!c.signedDocumentPath} />
          {awaiting && c.linkExpiresAt && <p className="mt-3 text-[13px] text-muted">Signing link expires {formatDateTime(c.linkExpiresAt)}.</p>}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="font-serif text-lg font-semibold">Details</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 text-[14px] sm:grid-cols-2">
              <Item label="Email" value={c.customerEmail} />
              <Item label="Phone" value={c.customerPhone} />
              <Item label="Membership" value={`${formatLongDate(c.startDate)} – ${formatLongDate(c.endDate)}`} />
              <Item label="Duration" value={c.durationLabel} />
              <Item label="Amount paid" value={formatMoney(c.amountPaid, c.currency)} />
              <Item label="Payment status" value={PAYMENT_STATUS_LABELS[c.paymentStatus]} />
              {c.paymentStatus !== "paid_in_full" && <Item label="Outstanding balance" value={formatMoney(c.outstandingBalance, c.currency)} />}
              {c.paymentSchedule && <Item label="Payment schedule" value={c.paymentSchedule} />}
              <Item label="Created by" value={c.createdByName ?? "—"} />
              <Item label="Template" value={`Version ${c.templateVersion ?? "?"}`} />
            </dl>
          </Card>

          {(c.status === "signed" || c.consentAt) && (
            <Card className="p-5 sm:p-6">
              <h2 className="font-serif text-lg font-semibold">Signing evidence</h2>
              <dl className="mt-4 grid gap-x-6 gap-y-4 text-[14px] sm:grid-cols-2">
                <Item label="Provider" value={c.esignProvider === "dropbox_sign" ? `Dropbox Sign${pd.testMode ? " (test mode — not binding)" : ""}` : "Simulated (demo)"} />
                {pd.signatureRequestId && <Item label="Provider request ID" value={pd.signatureRequestId} mono />}
                {pd.signer?.name && <Item label="Signer" value={`${pd.signer.name} <${pd.signer.email}>`} />}
                <Item label="E-sign consent" value={formatDateTime(c.consentAt)} />
                <Item label="Signed at" value={formatDateTime(c.signedAt)} />
                <Item label="Confirmation emailed" value={formatDateTime(c.confirmationSentAt)} />
                <Item label="Original document SHA-256" value={c.documentSha256 ?? "—"} mono wide />
                {c.signedDocumentSha256 && <Item label="Signed document SHA-256" value={c.signedDocumentSha256} mono wide />}
              </dl>
              {c.esignProvider === "dropbox_sign" && c.status === "signed" && (
                <p className="mt-4 text-[13px] text-muted">The signed PDF includes Dropbox Sign&apos;s audit trail (signer identity, IP addresses and timestamps).</p>
              )}
            </Card>
          )}

          {template && (
            <Card className="overflow-hidden">
              <details>
                <summary className="cursor-pointer select-none px-5 py-4 font-serif text-lg font-semibold sm:px-6">Contract text</summary>
                <div className="border-t border-line px-5 py-8 sm:px-10">
                  <ContractDocument blocks={renderTemplate(template.body, c.fieldValues)} />
                </div>
              </details>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="font-serif text-lg font-semibold">Activity</h2>
            <ol className="mt-4 space-y-4">
              {events.map((e) => (
                <li key={e.id} className="relative pl-5 text-[14px]">
                  <span className="absolute left-0 top-2 size-2 rounded-full bg-bronze-light" aria-hidden />
                  <p className="font-medium leading-5">{EVENT_LABELS[e.event] ?? e.event}</p>
                  <p className="text-[12.5px] text-muted">
                    {formatDateTime(e.createdAt)} · {e.actorType === "staff" ? e.actorLabel : e.actorType === "customer" ? "Customer" : e.actorType === "provider" ? e.actorLabel : "System"}
                    {e.event === "provider.event" && ` · ${String(e.details.eventType)}`}
                  </p>
                </li>
              ))}
              {events.length === 0 && <li className="text-[14px] text-muted">No activity yet.</li>}
            </ol>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-serif text-lg font-semibold">Emails</h2>
            <ul className="mt-4 space-y-3 text-[14px]">
              {emails.map((m) => (
                <li key={m.id}>
                  <p className="font-medium leading-5">{m.subject}</p>
                  <p className="text-[12.5px] text-muted">
                    To {m.to} · {formatDateTime(m.createdAt)}
                    {m.simulated && <span className="ml-1 font-semibold text-red-800">· simulated, not sent</span>}
                  </p>
                </li>
              ))}
              {emails.length === 0 && <li className="text-muted">No emails yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Item({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[12.5px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={mono ? "mt-0.5 break-all font-mono text-[12.5px]" : "mt-0.5 break-words"}>{value}</dd>
    </div>
  );
}
