import "server-only";
import { getStore } from "../db";
import type { ActorType, StaffUser } from "../types";
import type { RequestMeta } from "../request";

export type Actor = { type: "staff"; user: StaffUser } | { type: Exclude<ActorType, "staff">; label?: string };

export async function audit(
  contractId: string | null,
  actor: Actor,
  event: string,
  details: Record<string, unknown> = {},
  meta: Partial<RequestMeta> = {},
) {
  const store = await getStore();
  await store.addAuditEvent({
    contractId,
    actorType: actor.type,
    actorId: actor.type === "staff" ? actor.user.id : null,
    actorLabel: actor.type === "staff" ? actor.user.email : (actor.label ?? null),
    event,
    details,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });
}

export const EVENT_LABELS: Record<string, string> = {
  "contract.created": "Contract generated",
  "contract.sent": "Sent for signature",
  "contract.resent": "Signing request resent",
  "contract.link_copied": "Signing link copied",
  "contract.viewed": "Opened by customer",
  "contract.consent_given": "Customer consented to sign electronically",
  "contract.signing_started": "Customer opened the signing panel",
  "contract.signed": "Signature completed (provider verified)",
  "contract.signed_demo": "Simulated signature (demo — not legally binding)",
  "contract.declined": "Declined by customer",
  "contract.expired": "Signing link expired",
  "contract.signed_pdf_stored": "Signed PDF and audit trail stored",
  "contract.confirmation_sent": "Signed copy emailed",
  "contract.downloaded": "Document downloaded",
  "contract.draft_deleted": "Draft deleted",
  "contract.anonymised": "Personal data erased (retention)",
  "provider.event": "E-signature provider event",
  "provider.error": "E-signature provider error",
  "template.version_created": "Template version created",
  "template.version_activated": "Template version activated",
  "staff.signed_in": "Signed in",
  "staff.created": "Staff account created",
  "staff.updated": "Staff account updated",
  "staff.password_reset": "Staff password reset",
  "staff.password_changed": "Password changed",
};
