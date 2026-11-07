import { contractInputSchema } from "@/lib/validation";
import { errorResponse, json, readJson, staffRoute } from "@/lib/api";
import { requestMeta } from "@/lib/request";
import { getContractForStaff, sendContract, updateDraft } from "@/lib/services/contracts";
import { getStore } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Saves changes to an unsent draft, and optionally sends it for signature. */
export const PUT = staffRoute<Ctx>(async (req, user, { params }) => {
  const c = await getContractForStaff(user, (await params).id);
  if (!c) return json({ error: "Contract not found." }, 404);
  const body = (await readJson(req)) as { input?: unknown; send?: boolean };
  const input = contractInputSchema.parse(body.input);
  const meta = await requestMeta();
  const draft = await updateDraft(user, c, input, meta);
  if (!body.send) return json({ id: draft.id, reference: draft.reference, status: draft.status });
  try {
    const sent = await sendContract(user, draft, meta);
    const emails = await (await getStore()).listEmailLog({ contractId: sent.id, limit: 1 });
    return json({ id: sent.id, reference: sent.reference, customerEmail: sent.customerEmail, status: sent.status, emailSimulated: emails[0]?.simulated ?? false, demo: sent.isDemo });
  } catch (e) {
    return errorResponse(e, { contractId: draft.id });
  }
});
