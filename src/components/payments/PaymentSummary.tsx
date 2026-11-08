import Link from "next/link";
import type { PaymentTotals } from "@/lib/payments";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui";

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "alert" }) {
  return (
    <Card className="p-5">
      <p className="text-[12.5px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-serif text-[28px] font-semibold leading-none tabular-nums">{value}</p>
      {note && (
        <p className={tone === "alert" ? "mt-2 flex items-center gap-1.5 text-[13px] font-medium text-red-800" : "mt-2 text-[13px] text-muted"}>
          {tone === "alert" && (
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M8 2 1.5 13.5h13L8 2Z" strokeLinejoin="round" /><path d="M8 6.5v3M8 11.5v.5" strokeLinecap="round" /></svg>
          )}
          {note}
        </p>
      )}
    </Card>
  );
}

/** Cash collected / to be collected / overdue, in GBP (other currencies converted). */
export function PaymentSummary({ totals, link }: { totals: PaymentTotals; link?: boolean }) {
  if (totals.contracts === 0 && totals.pendingFx === 0) {
    return <Card className="p-5 text-[14px] text-muted">No signed contracts yet — payments appear here once customers sign.</Card>;
  }
  const t = totals;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Cash collected" value={formatMoney(t.collected, t.currency)} note={`From ${t.contracts} signed contract${t.contracts === 1 ? "" : "s"}`} />
        <Tile label="To be collected" value={formatMoney(t.toCollect, t.currency)} note={t.dueNext30 > 0 ? `${formatMoney(t.dueNext30, t.currency)} due in the next 30 days` : "Nothing due in the next 30 days"} />
        <Tile
          label="Overdue"
          value={formatMoney(t.overdue, t.currency)}
          note={t.overdueCount ? `${t.overdueCount} payment${t.overdueCount === 1 ? "" : "s"} past due` : "Nothing overdue"}
          tone={t.overdueCount ? "alert" : undefined}
        />
      </div>
      <FxNote converted={t.converted} pending={t.pendingFx} />
      {link && (
        <p className="text-right text-[14px]">
          <Link href="/payments" className="font-medium text-bronze-dark hover:underline">View all payments →</Link>
        </p>
      )}
    </div>
  );
}

/** Explains that totals include converted contracts (and any still waiting for a rate). */
export function FxNote({ converted, pending }: { converted: number; pending: number }) {
  if (!converted && !pending) return null;
  return (
    <p className="text-[12.5px] text-muted">
      {converted > 0 && <>All amounts in GBP. {converted} USD contract{converted === 1 ? " is" : "s are"} converted at the exchange rate on the day {converted === 1 ? "it was" : "they were"} signed. </>}
      {pending > 0 && <span className="font-medium text-amber-800">{pending} USD contract{pending === 1 ? " is" : "s are"} not included yet — waiting for the exchange rate.</span>}
    </p>
  );
}
