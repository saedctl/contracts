import Link from "next/link";
import type { ReactNode } from "react";
import { addMonths, cashEvents, mainCurrency, monthKey, monthName, monthlySeries, summarise, type CashEvent } from "@/lib/cashflow";
import type { Contract } from "@/lib/types";
import { formatMoney, formatShortDate } from "@/lib/utils";
import { Card, cx } from "@/components/ui";
import { CashflowChart } from "./CashflowChart";
import { MarkCollectedButton } from "./MarkCollectedButton";

function EventList({ title, empty, events, due, canUndo }: { title: string; empty: string; events: CashEvent[]; due?: boolean; canUndo: boolean }) {
  return (
    <Card className="overflow-hidden">
      <h3 className="border-b border-line px-5 py-3.5 text-[14px] font-semibold">{title}</h3>
      {events.length === 0 ? (
        <p className="px-5 py-6 text-[14px] text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((e, i) => (
            <li key={`${e.contractId}-${e.label}-${i}`} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
              <div className="min-w-0">
                <Link href={`/contracts/${e.contractId}`} className="block truncate font-medium hover:underline">{e.customerName}</Link>
                <p className="truncate text-[12.5px] text-muted">
                  {e.label} · {due ? "due" : "paid"} {formatShortDate(e.date)}
                  {e.state === "overdue" && <span className="font-semibold text-red-800"> · overdue</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-semibold tabular-nums">{formatMoney(e.amount, e.currency)}</span>
                {due && e.instalmentId && (
                  <MarkCollectedButton id={e.contractId} instalmentId={e.instalmentId} amount={formatMoney(e.amount, e.currency)} collected={false} canUndo={canUndo} compact />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** "This month vs next month" view of cash, with the contracts behind each number. */
export function MonthlyCashflow({ contracts, today, isAdmin, headerRight }: { contracts: Contract[]; today: string; isAdmin: boolean; headerRight?: ReactNode }) {
  const events = cashEvents(contracts, today);
  if (events.length === 0) {
    return (
      <section className="space-y-4" aria-labelledby="monthly-cash">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="monthly-cash" className="font-serif text-[22px] font-semibold">Monthly cash</h2>
          {headerRight}
        </div>
        <Card className="p-5 text-[14px] text-muted">No signed contracts yet — payments appear here once customers sign.</Card>
      </section>
    );
  }
  const currency = mainCurrency(events);
  const thisMonth = monthKey(today);
  const lastMonth = addMonths(thisMonth, -1);
  const nextMonth = addMonths(thisMonth, 1);

  const collected = summarise(events, thisMonth, ["collected"], currency);
  const collectedLast = summarise(events, lastMonth, ["collected"], currency);
  const stillDue = summarise(events, thisMonth, ["due", "overdue"], currency);
  const dueNext = summarise(events, nextMonth, ["due"], currency);
  const delta = collected.total - collectedLast.total;
  const otherCurrencies = [...new Set(events.map((e) => e.currency))].filter((c) => c !== currency);
  const money = (n: number) => formatMoney(n, currency);
  const members = (s: { events: CashEvent[] }) => new Set(s.events.map((e) => e.contractId)).size;

  return (
    <section className="space-y-4" aria-labelledby="monthly-cash">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="monthly-cash" className="font-serif text-[22px] font-semibold">Monthly cash</h2>
          <p className="text-[14px] text-muted">{monthName(thisMonth)} so far, against what&apos;s due in {monthName(nextMonth, true).split(" ")[0]}.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {headerRight}
          {otherCurrencies.length > 0 && <p className="text-[12.5px] text-muted">Showing {currency}. {otherCurrencies.join(", ")} payments are in the table below.</p>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-[12.5px] font-medium uppercase tracking-wide text-muted">Collected in {monthName(thisMonth).split(" ")[0]}</p>
          <p className="mt-2 font-serif text-[34px] font-semibold leading-none">{money(collected.total)}</p>
          <p className="mt-2 text-[13px] text-muted">
            {collected.count} payment{collected.count === 1 ? "" : "s"} from {members(collected)} member{members(collected) === 1 ? "" : "s"}
            {collectedLast.total > 0 || collected.total > 0 ? (
              <span className={cx("ml-1.5 font-medium", delta >= 0 ? "text-emerald-800" : "text-red-800")}>
                {delta >= 0 ? "▲" : "▼"} {money(Math.abs(delta))} vs {monthName(lastMonth).split(" ")[0]}
              </span>
            ) : null}
          </p>
          {stillDue.total > 0 && <p className="mt-1 text-[13px] text-muted">+ {money(stillDue.total)} still due this month</p>}
        </Card>
        <Card className="p-5">
          <p className="text-[12.5px] font-medium uppercase tracking-wide text-muted">To collect in {monthName(nextMonth).split(" ")[0]}</p>
          <p className="mt-2 font-serif text-[34px] font-semibold leading-none">{money(dueNext.total)}</p>
          <p className="mt-2 text-[13px] text-muted">
            {dueNext.count ? `${dueNext.count} payment${dueNext.count === 1 ? "" : "s"} from ${members(dueNext)} member${members(dueNext) === 1 ? "" : "s"}` : "Nothing scheduled yet"}
          </p>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <CashflowChart buckets={monthlySeries(events, today, currency, 6, 3)} currency={currency} />
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <EventList title={`Collected in ${monthName(thisMonth)}`} empty="Nothing collected yet this month." events={[...collected.events].reverse()} canUndo={isAdmin} />
        <EventList title={`Due in ${monthName(nextMonth)}`} empty="Nothing due next month." events={dueNext.events} due canUndo={isAdmin} />
      </div>
    </section>
  );
}
