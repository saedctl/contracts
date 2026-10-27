import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { json } from "@/lib/api";
import { runMaintenance } from "@/lib/services/contracts";

// Daily job (see vercel.json): expires stale signing links, reconciles with the e-signature
// provider in case a webhook was missed, deletes abandoned drafts and erases personal data
// past its retention date. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = config.cronSecret;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return json({ error: "Unauthorized" }, 401);
  }
  return json(await runMaintenance());
}
