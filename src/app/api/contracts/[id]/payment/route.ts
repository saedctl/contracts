import { json, readJson, staffRoute } from "@/lib/api";
import { requestMeta } from "@/lib/request";
import { getContractForStaff, setBalanceCollected } from "@/lib/services/contracts";

type Ctx = { params: Promise<{ id: string }> };

/** Records that a signed contract's outstanding balance has (or hasn't) been collected. */
export const POST = staffRoute<Ctx>(async (req, user, { params }) => {
  const c = await getContractForStaff(user, (await params).id);
  if (!c) return json({ error: "Contract not found." }, 404);
  const body = (await readJson(req, 1000)) as { collected?: unknown };
  const updated = await setBalanceCollected(user, c, body.collected !== false, await requestMeta());
  return json({ balanceCollectedAt: updated.balanceCollectedAt });
});
