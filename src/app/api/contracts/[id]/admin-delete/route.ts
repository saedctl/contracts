import { json, readJson, staffRoute } from "@/lib/api";
import { requestMeta } from "@/lib/request";
import { adminDeleteContract, getContractForStaff } from "@/lib/services/contracts";

type Ctx = { params: Promise<{ id: string }> };

/** Administrators only: permanently delete a contract of any status. */
export const POST = staffRoute<Ctx>(async (req, user, { params }) => {
  if (user.role !== "admin") return json({ error: "Only administrators can delete contracts." }, 403);
  const c = await getContractForStaff(user, (await params).id);
  if (!c) return json({ error: "Contract not found." }, 404);
  const body = (await readJson(req, 1000)) as { confirm?: unknown };
  await adminDeleteContract(user, c, String(body.confirm ?? ""), await requestMeta());
  return json({ ok: true });
});
