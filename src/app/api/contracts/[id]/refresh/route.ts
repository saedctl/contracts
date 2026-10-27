import { json, staffRoute } from "@/lib/api";
import { getContractForStaff, syncFromProvider } from "@/lib/services/contracts";

type Ctx = { params: Promise<{ id: string }> };

/** Manually reconciles status with the e-signature provider (fallback if a webhook was missed). */
export const POST = staffRoute<Ctx>(async (_req, user, { params }) => {
  const c = await getContractForStaff(user, (await params).id);
  if (!c) return json({ error: "Contract not found." }, 404);
  const updated = await syncFromProvider(c.id);
  return json({ status: updated.status });
});
