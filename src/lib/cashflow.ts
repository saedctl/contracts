// Month-by-month cash view of signed contracts: what was collected when, and what is due when.
// Pure (usable on server and client).

import { planOf } from "./payments";
import type { Contract, Currency } from "./types";

export interface CashEvent {
  contractId: string;
  customerName: string;
  reference: string;
  currency: Currency;
  amount: number;
  /** Collection date for collected money, due date for money still owed. YYYY-MM-DD */
  date: string;
  /** "At signing", "Instalment 2 of 3" or "Balance". */
  label: string;
  state: "collected" | "due" | "overdue";
  /** Set for amounts still owed, so they can be marked collected. */
  instalmentId?: string;
}

export interface MonthBucket {
  key: string; // YYYY-MM
  label: string; // "Nov"
  longLabel: string; // "November 2026"
  collected: number;
  scheduled: number; // still owed, due this month or later (current/future months)
  overdue: number; // still owed, due before today
  isCurrent: boolean;
  isFuture: boolean;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthName(key: string, long = true): string {
  const [y, m] = key.split("-").map(Number);
  return long ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1].slice(0, 3);
}

/** Every payment of every signed contract, as dated events. */
export function cashEvents(contracts: Contract[], today: string): CashEvent[] {
  const events: CashEvent[] = [];
  for (const c of contracts) {
    if (c.status !== "signed" || c.anonymisedAt) continue;
    const base = { contractId: c.id, customerName: c.customerName, reference: c.reference, currency: c.currency };
    if (c.amountPaid > 0) {
      events.push({ ...base, amount: c.amountPaid, date: c.createdAt.slice(0, 10), label: "At signing", state: "collected" });
    }
    const plan = planOf(c, today);
    plan.forEach((it, i) => {
      const label = plan.length > 1 ? `Instalment ${i + 1} of ${plan.length}` : "Balance";
      if (it.collectedAt) {
        events.push({ ...base, amount: it.amount, date: it.collectedAt.slice(0, 10), label, state: "collected" });
      } else if (it.dueDate) {
        events.push({ ...base, amount: it.amount, date: it.dueDate, label, state: it.state === "overdue" ? "overdue" : "due", instalmentId: it.id });
      }
    });
  }
  return events;
}

/** The currency most contracts use (amounts in different currencies are never added together). */
export function mainCurrency(events: CashEvent[]): Currency {
  const counts = new Map<Currency, number>();
  for (const e of events) counts.set(e.currency, (counts.get(e.currency) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "GBP";
}

/** Buckets from `back` months ago to `forward` months ahead of the current month. */
export function monthlySeries(events: CashEvent[], today: string, currency: Currency, back = 5, forward = 6): MonthBucket[] {
  const current = monthKey(today);
  const buckets: MonthBucket[] = [];
  for (let i = -back; i <= forward; i++) {
    const key = addMonths(current, i);
    buckets.push({ key, label: monthName(key, false), longLabel: monthName(key), collected: 0, scheduled: 0, overdue: 0, isCurrent: i === 0, isFuture: i > 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const e of events) {
    if (e.currency !== currency) continue;
    const b = byKey.get(monthKey(e.date));
    if (!b) continue;
    if (e.state === "collected") b.collected += e.amount;
    else if (e.state === "overdue") b.overdue += e.amount;
    else b.scheduled += e.amount;
  }
  return buckets;
}

export interface MonthSummary {
  key: string;
  total: number;
  count: number;
  events: CashEvent[];
}

export function summarise(events: CashEvent[], key: string, states: CashEvent["state"][], currency: Currency): MonthSummary {
  const list = events
    .filter((e) => e.currency === currency && monthKey(e.date) === key && states.includes(e.state))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { key, total: list.reduce((s, e) => s + e.amount, 0), count: list.length, events: list };
}
