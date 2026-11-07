import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { listContractsForStaff } from "@/lib/services/contracts";
import { PAYMENT_STATE_LABELS, paymentRow, paymentTotals, sortPaymentRows, type PaymentRow, type PaymentState } from "@/lib/payments";
import { formatMoney, formatShortDate, todayISO } from "@/lib/utils";
import { Card, cx } from "@/components/ui";
import { PaymentSummary } from "@/components/payments/PaymentSummary";
import { MarkCollectedButton } from "@/components/payments/MarkCollectedButton";
import { MonthlyCashflow } from "@/components/payments/MonthlyCashflow";
import { PeriodSelect } from "@/components/payments/PeriodSelect";

export const metadata: Metadata = { title: "Payments" };

const VIEWS = [
  { key: "outstanding", label: "To collect" },
  { key: "overdue", label: "Overdue" },
  { key: "settled", label: "Settled" },
  { key: "all", label: "All signed" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const STATE_STYLES: Record<PaymentState, string> = {
  overdue: "bg-red-50 text-red-800 ring-red-200",
  due: "bg-amber-50 text-amber-800 ring-amber-200",
  no_due_date: "bg-amber-50 text-amber-800 ring-amber-200",
  collected: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  paid_in_full: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

function StateBadge({ row }: { row: PaymentRow }) {
  const label = row.state === "overdue" ? `Overdue · ${row.daysOverdue} day${row.daysOverdue === 1 ? "" : "s"}` : PAYMENT_STATE_LABELS[row.state];
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-medium ring-1 ring-inset", STATE_STYLES[row.state])}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </span>
  );
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.key === sp.view) ? (sp.view as View) : "outstanding";
  // Monthly is the default summary; "All time" shows the overall totals.
  const period: "month" | "all" = sp.period === "all" ? "all" : "month";
  const q = (sp.q ?? "").slice(0, 100);
  const today = todayISO();

  const signed = await listContractsForStaff(user, { status: "signed", q: q || undefined });
  const rows = sortPaymentRows(signed.filter((c) => !c.anonymisedAt).map((c) => paymentRow(c, today)));
  const totals = paymentTotals(rows, today);
  const shown = rows.filter((r) =>
    view === "all" ? true
    : view === "overdue" ? r.state === "overdue"
    : view === "settled" ? r.state === "collected" || r.state === "paid_in_full"
    : r.outstanding > 0,
  );
  const counts: Record<View, number> = {
    outstanding: rows.filter((r) => r.outstanding > 0).length,
    overdue: rows.filter((r) => r.state === "overdue").length,
    settled: rows.filter((r) => r.state === "collected" || r.state === "paid_in_full").length,
    all: rows.length,
  };
  const href = (v: View) => `/payments?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}${period === "all" ? "&period=all" : ""}`;
  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{isAdmin ? "All signed contracts" : "Your signed contracts"}</p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold leading-tight sm:text-[32px]">Payments</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted">Cash collected and still to collect on signed contracts. Mark each payment as collected once the money arrives; the full plan is on each contract&apos;s page.</p>
      </div>

      {period === "month" ? (
        <MonthlyCashflow
          contracts={q ? await listContractsForStaff(user, { status: "signed" }) : signed}
          today={today}
          isAdmin={isAdmin}
          headerRight={<PeriodSelect value="month" />}
        />
      ) : (
        <section className="space-y-4" aria-labelledby="all-time-cash">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="all-time-cash" className="font-serif text-[22px] font-semibold">All-time cash</h2>
              <p className="text-[14px] text-muted">Everything collected and still to collect across all signed contracts.</p>
            </div>
            <PeriodSelect value="all" />
          </div>
          <PaymentSummary totals={totals} />
        </section>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:p-5">
          <form className="relative flex-1" role="search" action="/payments">
            <input type="hidden" name="view" value={view} />
            {period === "all" && <input type="hidden" name="period" value="all" />}
            <label htmlFor="q" className="sr-only">Search members</label>
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input id="q" name="q" defaultValue={q} placeholder="Search by name, email or reference" className="field-input pl-9" />
          </form>
          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1 sm:pb-0" aria-label="Filter payments">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={href(v.key)}
                aria-current={view === v.key ? "page" : undefined}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                  view === v.key ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {v.label}
                <span className={cx("tabular-nums", view === v.key ? "text-white/70" : "text-muted/70")}>{counts[v.key]}</span>
              </Link>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-serif text-lg">{view === "overdue" ? "Nothing overdue." : view === "outstanding" ? "Nothing left to collect." : "No payments to show."}</p>
            <p className="mt-1 text-[14px] text-muted">{q ? "Try a different search." : "Signed contracts appear here automatically."}</p>
          </div>
        ) : (
          <>
            <table className="hidden w-full text-left text-[14px] lg:table">
              <thead className="bg-paper/60 text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Collected</th>
                  <th className="whitespace-nowrap px-5 py-3 font-medium">To collect</th>
                  <th className="whitespace-nowrap px-5 py-3 font-medium">Next due</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => {
                  const c = r.contract;
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="px-5 py-4">
                        <Link href={`/contracts/${c.id}`} className="font-medium hover:underline">{c.customerName}</Link>
                        <div className="text-[13px] text-muted">{c.customerEmail} · {c.customerPhone}</div>
                        <div className="text-[12.5px] text-muted">{c.reference}{c.fieldValues.membership_tier ? ` · ${c.fieldValues.membership_tier}` : ""}{isAdmin && c.createdByName ? ` · ${c.createdByName}` : ""}</div>
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        <div className="font-medium">{formatMoney(r.totalCollected, c.currency)}</div>
                        <div className="text-[13px] text-muted">{formatMoney(r.collectedAtSigning, c.currency)} on {formatShortDate(r.collectedOn)}</div>
                        {r.paidCount > 0 && r.lastCollectedOn && (
                          <div className="text-[13px] text-muted">+ {r.plan.length > 1 ? `${r.paidCount} instalment${r.paidCount === 1 ? "" : "s"}` : "balance"}, last {formatShortDate(r.lastCollectedOn)}</div>
                        )}
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        {r.outstanding > 0 ? (
                          <>
                            <div className="font-medium">{formatMoney(r.outstanding, c.currency)}</div>
                            {r.plan.length > 1 && <div className="text-[13px] text-muted">{r.paidCount} of {r.plan.length} instalments paid</div>}
                          </>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {r.next ? (
                          <>
                            <div>{r.next.dueDate ? formatShortDate(r.next.dueDate) : <span className="text-muted">No date set</span>}</div>
                            {r.plan.length > 1 && <div className="text-[13px] text-muted">{formatMoney(r.next.amount, c.currency)} next</div>}
                          </>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-5 py-4"><StateBadge row={r} /></td>
                      <td className="px-5 py-4 text-right">
                        {r.next && (
                          <MarkCollectedButton id={c.id} instalmentId={r.next.id} amount={formatMoney(r.next.amount, c.currency)} collected={false} canUndo={isAdmin} compact label={r.plan.length > 1 ? `Mark ${formatMoney(r.next.amount, c.currency)} collected` : "Mark collected"} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <ul className="divide-y divide-line lg:hidden">
              {shown.map((r) => {
                const c = r.contract;
                return (
                  <li key={c.id} className="space-y-2 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/contracts/${c.id}`} className="block truncate font-medium">{c.customerName}</Link>
                        <p className="truncate text-[13px] text-muted">{c.customerEmail} · {c.customerPhone}</p>
                      </div>
                      <StateBadge row={r} />
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-[13.5px]">
                      <div><dt className="text-muted">Collected</dt><dd className="font-medium tabular-nums">{formatMoney(r.totalCollected, c.currency)}</dd></div>
                      <div><dt className="text-muted">To collect</dt><dd className="font-medium tabular-nums">{r.outstanding > 0 ? formatMoney(r.outstanding, c.currency) : "—"}</dd></div>
                      {r.next && <div className="col-span-2"><dt className="text-muted">Next due</dt><dd className="tabular-nums">{formatMoney(r.next.amount, c.currency)}{r.next.dueDate ? ` on ${formatShortDate(r.next.dueDate)}` : ""}{r.plan.length > 1 ? ` · ${r.paidCount} of ${r.plan.length} paid` : ""}</dd></div>}
                    </dl>
                    {r.next && (
                      <div className="flex justify-end">
                        <MarkCollectedButton id={c.id} instalmentId={r.next.id} amount={formatMoney(r.next.amount, c.currency)} collected={false} canUndo={isAdmin} compact label={r.plan.length > 1 ? `Mark ${formatMoney(r.next.amount, c.currency)} collected` : "Mark collected"} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
