import { json, readJson, staffRoute } from "@/lib/api";
import { requestMeta } from "@/lib/request";
import { getContractForStaff, setInstalmentCollected } from "@/lib/services/contracts";

type Ctx = { params: Promise<{ id: string }> };

/** Records that an instalment of a signed contract's balance has (or hasn't) been collected. */
export const POST = staffRoute<Ctx>(async (req, user, { params }) => {
  const c = await getContractForStaff(user, (await params).id);
  if (!c) return json({ error: "Contract not found." }, 404);
  const body = (await readJson(req, 1000)) as { collected?: unknown; instalmentId?: unknown };
  await setInstalmentCollected(user, c, String(body.instalmentId ?? "balance"), body.collected !== false, await requestMeta());
  return json({ ok: true });
});
