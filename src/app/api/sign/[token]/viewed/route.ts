import { json } from "@/lib/api";
import { signRoute } from "@/lib/sign-route";
import { markViewed } from "@/lib/services/contracts";

// Recorded from the browser (not on page render) so email link scanners don't count as views.
export const POST = signRoute(async (_req, s, meta) => {
  if (s.state === "ready") await markViewed(s.contract, meta);
  return json({ ok: true });
});
