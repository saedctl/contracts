import "server-only";
import { getStore } from "../db";
import { checkTemplate, normaliseImportedMarkdown } from "../template";
import { MEMBERSHIP_TIER_LABELS, type MembershipTier, type StaffUser, type TemplateVersion } from "../types";
import { sha256Hex } from "../utils";
import type { RequestMeta } from "../request";
import { audit } from "./audit";
import { UserFacingError } from "../errors";

export const MAX_TEMPLATE_CHARS = 200_000;

export async function createTemplateVersion(
  admin: StaffUser,
  input: { title: string; body: string; notes: string; activate: boolean; tier: MembershipTier | null },
  meta: RequestMeta,
) {
  if (admin.role !== "admin") throw new UserFacingError("Only administrators can change the template.");
  const title = input.title.trim();
  const body = input.body.replace(/\r\n?/g, "\n");
  if (!title) throw new UserFacingError("Give this template version a name.");
  if (body.trim().length < 50) throw new UserFacingError("The template looks empty. Paste or upload your full agreement.");
  if (body.length > MAX_TEMPLATE_CHARS) throw new UserFacingError("The template is too long.");
  const check = checkTemplate(body);
  if (check.unknown.length) {
    throw new UserFacingError(`Unknown placeholder${check.unknown.length > 1 ? "s" : ""}: ${check.unknown.map((k) => `{{${k}}}`).join(", ")}. Use only the approved placeholders.`);
  }
  if (check.unfilled.length) {
    throw new UserFacingError(`Fill in these items before saving: ${check.unfilled.join(", ")}.`);
  }
  const store = await getStore();
  const bodySha256 = sha256Hex(body);
  const t = await store.createTemplateVersion({ title, body, notes: input.notes.trim() || null, createdBy: admin.id, bodySha256, tier: input.tier });
  await audit(null, { type: "staff", user: admin }, "template.version_created", { version: t.version, tier: input.tier ?? "all", sha256: bodySha256 }, meta);
  if (input.activate) await activateTemplateVersion(admin, t.id, meta);
  return t;
}

export async function activateTemplateVersion(admin: StaffUser, id: string, meta: RequestMeta) {
  if (admin.role !== "admin") throw new UserFacingError("Only administrators can change the template.");
  const store = await getStore();
  const t = await store.getTemplateVersion(id);
  if (!t) throw new UserFacingError("Template version not found.");
  await store.activateTemplateVersion(id);
  await audit(null, { type: "staff", user: admin }, "template.version_activated", { version: t.version, tier: t.tier ?? "all" }, meta);
}

export function tierLabel(tier: MembershipTier | null): string {
  return tier ? MEMBERSHIP_TIER_LABELS[tier] : "All tiers";
}

/** The template a contract of this tier uses: the tier's own active template, else the all-tiers one. */
export function pickTemplate(active: TemplateVersion[], tier: MembershipTier): TemplateVersion | null {
  return active.find((t) => t.tier === tier) ?? active.find((t) => t.tier === null) ?? null;
}

export async function templateForTier(tier: MembershipTier): Promise<TemplateVersion | null> {
  return pickTemplate(await (await getStore()).getActiveTemplates(), tier);
}

/** Extracts the text of a .docx agreement without altering its wording. */
export async function importDocx(bytes: Uint8Array): Promise<{ body: string; warnings: string[] }> {
  const mammoth = await import("mammoth");
  const convert = (mammoth as unknown as {
    convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string; messages: { message: string }[] }>;
  }).convertToMarkdown;
  const result = await convert({ buffer: Buffer.from(bytes) });
  return {
    body: normaliseImportedMarkdown(result.value),
    warnings: result.messages.map((m) => m.message).slice(0, 10),
  };
}
