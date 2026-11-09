import { getCurrentUser } from "@/lib/auth/session";
import { json } from "@/lib/api";
import { listContractsForStaff } from "@/lib/services/contracts";
import { fxRatesFor } from "@/lib/services/fx";
import { inPaymentView, parsePaymentView, paymentRow, sortPaymentRows } from "@/lib/payments";
import { paymentsCsv } from "@/lib/payments-csv";
import { todayISO } from "@/lib/utils";

/** Downloads the Payments list as CSV, honouring the page's filter and search. Sales reps get their own contracts only. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Please sign in." }, 401);
  const url = new URL(req.url);
  const view = parsePaymentView(url.searchParams.get("view"));
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  const today = todayISO();

  const signed = (await listContractsForStaff(user, { status: "signed", q: q || undefined })).filter((c) => !c.anonymisedAt);
  const rates = await fxRatesFor(signed);
  const rows = sortPaymentRows(signed.map((c) => paymentRow(c, today))).filter((r) => inPaymentView(r, view));

  const filename = `payments-${view}-${today}.csv`;
  return new Response(paymentsCsv(rows, rates), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
