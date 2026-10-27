import { json, pdfResponse } from "@/lib/api";
import { getStore } from "@/lib/db";
import { signRoute } from "@/lib/sign-route";

export const GET = signRoute(async (_req, s) => {
  if (s.state === "invalid") return json({ error: "Not found" }, 404);
  const c = s.contract;
  const path = c.status === "signed" && c.signedDocumentPath ? c.signedDocumentPath : c.documentPath;
  const bytes = path ? await (await getStore()).getFile(path) : null;
  if (!bytes) return json({ error: "Document not available." }, 404);
  return pdfResponse(bytes, `${c.reference} Membership Agreement${c.isDemo ? " (DEMO)" : ""}.pdf`);
});
