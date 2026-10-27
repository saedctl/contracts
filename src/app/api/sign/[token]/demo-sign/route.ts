import { z } from "zod";
import { json, readJson } from "@/lib/api";
import { signRoute } from "@/lib/sign-route";
import { completeDemoSignature } from "@/lib/services/contracts";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("type"), typedName: z.string().trim().min(2).max(80) }),
  z.object({ kind: z.enum(["draw", "upload"]), image: z.string().regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/).max(2_000_000) }),
]);

export const POST = signRoute(async (req, s, meta) => {
  if (s.state !== "ready") return json({ error: "This agreement is no longer awaiting signature." }, 409);
  const body = schema.parse(await readJson(req, 2_100_000));
  if (body.kind === "type") {
    await completeDemoSignature(s.contract, { kind: "type", typedName: body.typedName }, meta);
  } else {
    const [, type, b64] = /^data:image\/(png|jpeg);base64,(.*)$/.exec(body.image)!;
    await completeDemoSignature(s.contract, { kind: body.kind, image: new Uint8Array(Buffer.from(b64, "base64")), imageType: type === "png" ? "png" : "jpg" }, meta);
  }
  return json({ ok: true });
});
