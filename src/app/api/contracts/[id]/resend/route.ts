import { json, staffRoute } from "@/lib/api";
import { requestMeta } from "@/lib/request";
import { getContractForStaff, resendContract } from "@/lib/services/contracts";

type Ctx = { params: Promise<{ id: string }> };

export const POST = staffRoute<Ctx>(async (_req, user, { params }) => {
  const c = await getContractForStaff(user, (await params).id);
  if (!c) return json({ error: "Contract not found." }, 404);
  const sent = await resendContract(user, c, await requestMeta());
  return json({ status: sent.status });
});
