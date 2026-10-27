import { json, staffRoute } from "@/lib/api";
import { requestMeta } from "@/lib/request";
import { copySigningLink, getContractForStaff } from "@/lib/services/contracts";

type Ctx = { params: Promise<{ id: string }> };

// POST (not GET) so the link is only revealed by a deliberate, audited action.
export const POST = staffRoute<Ctx>(async (_req, user, { params }) => {
  const c = await getContractForStaff(user, (await params).id);
  if (!c) return json({ error: "Contract not found." }, 404);
  return json({ url: await copySigningLink(user, c, await requestMeta()) });
});
