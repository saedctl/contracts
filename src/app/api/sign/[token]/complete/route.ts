import { json } from "@/lib/api";
import { signRoute } from "@/lib/sign-route";
import { signerReportedComplete } from "@/lib/services/contracts";

// Called by the browser when the embedded signer reports "signed". This never marks the
// contract as signed by itself; it only triggers verification with the provider.
export const POST = signRoute(async (_req, s) => {
  if (s.state === "ready") await signerReportedComplete(s.contract);
  return json({ ok: true });
});
