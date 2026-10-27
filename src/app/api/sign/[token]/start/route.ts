import { json, readJson } from "@/lib/api";
import { signRoute } from "@/lib/sign-route";
import { startSigning } from "@/lib/services/contracts";

export const POST = signRoute(async (req, s, meta) => {
  if (s.state !== "ready") return json({ error: "This agreement is no longer awaiting signature.", state: s.state }, 409);
  const body = (await readJson(req, 2_000)) as { consent?: unknown };
  if (body.consent !== true) return json({ error: "Please confirm you agree to sign electronically." }, 422);
  return json(await startSigning(s.contract, meta));
});
