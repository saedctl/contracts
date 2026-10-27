import "server-only";
import { errorResponse, json } from "./api";
import { rateLimit } from "./rate-limit";
import { requestMeta, type RequestMeta } from "./request";
import { resolveSigningToken, type SigningState } from "./services/contracts";

type Ctx = { params: Promise<{ token: string }> };

/** Public, token-authenticated route used by the customer signing page. */
export function signRoute(handler: (req: Request, s: SigningState, meta: RequestMeta) => Promise<Response>) {
  return async (req: Request, { params }: Ctx) => {
    const meta = await requestMeta();
    const limit = rateLimit(`sign:${meta.ip ?? "unknown"}`, 60, 60_000);
    if (!limit.ok) return json({ error: "Too many requests. Please wait a moment." }, 429);
    try {
      const state = await resolveSigningToken((await params).token);
      if (state.state === "invalid") return json({ error: "This signing link is not valid." }, 404);
      return await handler(req, state, meta);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
