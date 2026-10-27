import "server-only";
import { getStore } from "../db";
import { checkTemplate, normaliseImportedMarkdown } from "../template";
import type { StaffUser } from "../types";
import { sha256Hex } from "../utils";
import type { RequestMeta } from "../request";
import { audit } from "./audit";
import { UserFacingError } from "./contracts";

export const MAX_TEMPLATE_CHARS = 200_000;

export async function createTemplateVersion(
  admin: StaffUser,
  input: { title: string; body: string; notes: string; activate: boolean },
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
  const store = await getStore();
  const bodySha256 = sha256Hex(body);
  const t = await store.createTemplateVersion({ title, body, notes: input.notes.trim() || null, createdBy: admin.id, bodySha256 });
  await audit(null, { type: "staff", user: admin }, "template.version_created", { version: t.version, sha256: bodySha256 }, meta);
  if (input.activate) await activateTemplateVersion(admin, t.id, meta);
  return t;
}

export async function activateTemplateVersion(admin: StaffUser, id: string, meta: RequestMeta) {
  if (admin.role !== "admin") throw new UserFacingError("Only administrators can change the template.");
  const store = await getStore();
  const t = await store.getTemplateVersion(id);
  if (!t) throw new UserFacingError("Template version not found.");
  await store.activateTemplateVersion(id);
  await audit(null, { type: "staff", user: admin }, "template.version_activated", { version: t.version }, meta);
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
