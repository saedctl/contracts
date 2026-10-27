import { json, pdfResponse, staffRoute } from "@/lib/api";
import { getStore } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { audit } from "@/lib/services/audit";
import { getContractForStaff } from "@/lib/services/contracts";
import { sha256Hex } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export const GET = staffRoute<Ctx>(async (req, user, { params }) => {
  const c = await getContractForStaff(user, (await params).id);
  if (!c) return json({ error: "Contract not found." }, 404);
  const kind = new URL(req.url).searchParams.get("kind") === "signed" ? "signed" : "original";
  const path = kind === "signed" ? c.signedDocumentPath : c.documentPath;
  const expected = kind === "signed" ? c.signedDocumentSha256 : c.documentSha256;
  if (!path) return json({ error: kind === "signed" ? "The signed document isn't available yet." : "Document not available." }, 404);
  const bytes = await (await getStore()).getFile(path);
  if (!bytes) return json({ error: "Document not found in storage." }, 404);
  if (expected && sha256Hex(bytes) !== expected) {
    console.error(`Integrity check failed for ${c.id} (${kind})`);
    return json({ error: "Document integrity check failed. Contact an administrator." }, 500);
  }
  await audit(c.id, { type: "staff", user }, "contract.downloaded", { kind }, await requestMeta());
  const name = `${c.reference} ${c.customerName} ${kind === "signed" ? "Signed " : ""}Membership Agreement${c.isDemo ? " (DEMO)" : ""}.pdf`;
  return pdfResponse(bytes, name, new URL(req.url).searchParams.get("download") ? "attachment" : "inline");
});
