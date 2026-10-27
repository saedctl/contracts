import { contractInputSchema } from "@/lib/validation";
import { errorResponse, json, readJson, staffRoute } from "@/lib/api";
import { requestMeta } from "@/lib/request";
import { createContract, sendContract } from "@/lib/services/contracts";
import { getStore } from "@/lib/db";

export const POST = staffRoute(async (req, user) => {
  const body = (await readJson(req)) as { input?: unknown; send?: boolean };
  const input = contractInputSchema.parse(body.input);
  const meta = await requestMeta();
  const contract = await createContract(user, input, meta);
  if (!body.send) return json({ id: contract.id, reference: contract.reference, status: contract.status }, 201);
  try {
    const sent = await sendContract(user, contract, meta);
    const emails = await (await getStore()).listEmailLog({ contractId: sent.id, limit: 1 });
    return json({ id: sent.id, reference: sent.reference, customerEmail: sent.customerEmail, status: sent.status, emailSimulated: emails[0]?.simulated ?? false, demo: sent.isDemo }, 201);
  } catch (e) {
    // The contract exists as a draft; tell the UI so the rep can retry from the contract page.
    return errorResponse(e, { contractId: contract.id });
  }
});
