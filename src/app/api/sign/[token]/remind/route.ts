import { json } from "@/lib/api";
import { signRoute } from "@/lib/sign-route";
import { customerRequestSigningEmail } from "@/lib/services/contracts";

/** Hosted mode: the customer asks Dropbox Sign to email their signing link again. */
export const POST = signRoute(async (_req, s, meta) => {
  if (s.state !== "ready") return json({ error: "This agreement is no longer awaiting signature." }, 409);
  await customerRequestSigningEmail(s.contract, meta);
  return json({ ok: true });
});
