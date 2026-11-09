import Link from "next/link";
import { addMonths, cashEvents, conversionNote, monthKey, monthName, summarise } from "@/lib/cashflow";
import { REPORTING_CURRENCY, type FxRates } from "@/lib/fx";
import type { Contract } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { Card, cx } from "@/components/ui";
import { FxNote } from "./PaymentSummary";

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-[12.5px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-serif text-[28px] font-semibold leading-none tabular-nums">{value}</p>
      {children}
    </Card>
  );
}

/** Contracts dashboard: this month's cash collected vs what's still to collect, in GBP. */
export function DashboardMonthlyCash({ contracts, rates, today, headerRight }: { contracts: Contract[]; rates: FxRates; today: string; headerRight?: React.ReactNode }) {
  const events = cashEvents(contracts, today, rates);
  const currency = REPORTING_CURRENCY;
  const money = (n: number) => formatMoney(n, currency);
  const thisMonth = monthKey(today);
  const lastMonth = addMonths(thisMonth, -1);
  const nextMonth = addMonths(thisMonth, 1);
  const month = (k: string) => monthName(k).split(" ")[0];

  const collected = summarise(events, thisMonth, ["collected"], currency);
  const collectedLast = summarise(events, lastMonth, ["collected"], currency);
  const stillDue = summarise(events, thisMonth, ["due", "overdue"], currency);
  const dueNext = summarise(events, nextMonth, ["due"], currency);
  const overdue = events.filter((e) => e.currency === currency && e.state === "overdue");
  const overdueTotal = overdue.reduce((t, e) => t + e.amount, 0);
  const delta = collected.total - collectedLast.total;
  const fx = conversionNote(contracts, rates);
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

  return (
    <section className="space-y-3" aria-labelledby="dash-monthly-cash">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="dash-monthly-cash" className="font-serif text-[20px] font-semibold">Cash this month · {monthName(thisMonth)}</h2>
        {headerRight}
      </div>
      {events.length === 0 && fx.pending === 0 ? (
        <Card className="p-5 text-[14px] text-muted">No signed contracts yet — payments appear here once customers sign.</Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label={`Collected in ${month(thisMonth)}`} value={money(collected.total)}>
              <p className="mt-2 text-[13px] text-muted">
                {n(collected.count, "payment")}
                {(collected.total > 0 || collectedLast.total > 0) && (
                  <span className={cx("ml-1.5 font-medium", delta >= 0 ? "text-emerald-800" : "text-red-800")}>
                    {delta >= 0 ? "▲" : "▼"} {money(Math.abs(delta))} vs {month(lastMonth)}
                  </span>
                )}
              </p>
            </Tile>
            <Tile label={`Still to collect in ${month(thisMonth)}`} value={money(stillDue.total)}>
              <p className="mt-2 text-[13px] text-muted">{stillDue.count ? `${n(stillDue.count, "payment")} due this month` : "Nothing else due this month"}</p>
              {overdue.length > 0 && (
                <p className="mt-1 text-[13px] font-medium text-red-800">{money(overdueTotal)} overdue in total ({n(overdue.length, "payment")})</p>
              )}
            </Tile>
            <Tile label={`To collect in ${month(nextMonth)}`} value={money(dueNext.total)}>
              <p className="mt-2 text-[13px] text-muted">{dueNext.count ? `${n(dueNext.count, "payment")} scheduled` : "Nothing scheduled yet"}</p>
            </Tile>
          </div>
          <FxNote converted={fx.converted} pending={fx.pending} />
          <p className="text-right text-[14px]">
            <Link href="/payments" className="font-medium text-bronze-dark hover:underline">View all payments →</Link>
          </p>
        </>
      )}
    </section>
  );
}
