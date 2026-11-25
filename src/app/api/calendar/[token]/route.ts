import { calendarIcs, resolveCalendarToken } from "@/lib/services/calendar";
import { rateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ token: string }> };

/** Private calendar feed (.ics). Calendar apps poll it, so paid instalments update by themselves. */
export async function GET(req: Request, { params }: Ctx) {
  const token = (await params).token;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`calendar:${ip}`, 120, 60_000).ok) return new Response("Too many requests", { status: 429 });
  const owner = await resolveCalendarToken(token);
  if (!owner) return new Response("Calendar not found", { status: 404, headers: { "cache-control": "no-store" } });
  const download = new URL(req.url).searchParams.has("download");
  return new Response(await calendarIcs(owner), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="engineers-club-payments.ics"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
