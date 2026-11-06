// Cash collected / to be collected for signed contracts. Pure (usable on server and client).

import type { Contract, Currency } from "./types";

export type PaymentState = "paid_in_full" | "collected" | "due" | "overdue" | "no_due_date";
export type InstalmentState = "collected" | "due" | "overdue" | "no_due_date";

/** A scheduled payment, normalised so older single-balance contracts look the same. */
export interface PlanItem {
  id: string; // "balance" for contracts created before instalments existed
  amount: number;
  dueDate: string | null;
  collectedAt: string | null;
  state: InstalmentState;
  daysOverdue: number;
}

export interface PaymentRow {
  contract: Contract;
  /** Collected when the contract was issued. */
  collectedAtSigning: number;
  collectedOn: string; // YYYY-MM-DD
  plan: PlanItem[];
  /** Original outstanding balance (sum of the plan). */
  balance: number;
  /** Still to collect. */
  outstanding: number;
  totalCollected: number;
  paidCount: number;
  /** Next uncollected instalment, if any. */
  next: PlanItem | null;
  lastCollectedOn: string | null;
  state: PaymentState;
  /** Days the earliest overdue instalment is late. */
  daysOverdue: number;
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  paid_in_full: "Paid in full",
  collected: "Balance collected",
  due: "Due",
  overdue: "Overdue",
  no_due_date: "Due — no date",
};

export const INSTALMENT_STATE_LABELS: Record<InstalmentState, string> = {
  collected: "Collected",
  due: "Due",
  overdue: "Overdue",
  no_due_date: "No due date",
};

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function itemState(dueDate: string | null, collectedAt: string | null, today: string): InstalmentState {
  if (collectedAt) return "collected";
  if (!dueDate) return "no_due_date";
  return dueDate < today ? "overdue" : "due";
}

export function planOf(c: Contract, today: string): PlanItem[] {
  const raw =
    c.instalments?.length
      ? c.instalments.map((it) => ({ id: it.id, amount: it.amount, dueDate: it.dueDate, collectedAt: it.collectedAt }))
      : c.outstandingBalance > 0
        ? [{ id: "balance", amount: c.outstandingBalance, dueDate: c.balanceDueDate, collectedAt: c.balanceCollectedAt }]
        : [];
  return raw
    .map((it) => {
      const state = itemState(it.dueDate, it.collectedAt, today);
      return { ...it, state, daysOverdue: state === "overdue" && it.dueDate ? daysBetween(it.dueDate, today) : 0 };
    })
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

export function paymentRow(c: Contract, today: string): PaymentRow {
  const plan = planOf(c, today);
  const balance = plan.reduce((s, it) => s + it.amount, 0);
  const open = plan.filter((it) => !it.collectedAt);
  const outstanding = open.reduce((s, it) => s + it.amount, 0);
  const collectedPlan = balance - outstanding;
  const overdue = open.filter((it) => it.state === "overdue");
  const next = open[0] ?? null;
  let state: PaymentState;
  if (plan.length === 0) state = "paid_in_full";
  else if (open.length === 0) state = "collected";
  else if (overdue.length) state = "overdue";
  else if (!next?.dueDate) state = "no_due_date";
  else state = "due";
  const collectedDates = plan.map((it) => it.collectedAt).filter((d): d is string => !!d).sort();
  return {
    contract: c,
    collectedAtSigning: c.amountPaid,
    collectedOn: c.createdAt.slice(0, 10),
    plan,
    balance,
    outstanding,
    totalCollected: c.amountPaid + collectedPlan,
    paidCount: plan.length - open.length,
    next,
    lastCollectedOn: collectedDates.length ? collectedDates[collectedDates.length - 1].slice(0, 10) : null,
    state,
    daysOverdue: overdue.length ? Math.max(...overdue.map((it) => it.daysOverdue)) : 0,
  };
}

export interface PaymentTotals {
  currency: Currency;
  collected: number;
  toCollect: number;
  overdue: number;
  overdueCount: number;
  dueNext30: number;
  contracts: number;
}

/** Totals per currency (amounts in different currencies are never added together). */
export function paymentTotals(rows: PaymentRow[], today: string): PaymentTotals[] {
  const in30 = new Date(Date.parse(today) + 30 * 86400000).toISOString().slice(0, 10);
  const by = new Map<Currency, PaymentTotals>();
  for (const r of rows) {
    const cur = r.contract.currency;
    const t = by.get(cur) ?? { currency: cur, collected: 0, toCollect: 0, overdue: 0, overdueCount: 0, dueNext30: 0, contracts: 0 };
    t.contracts++;
    t.collected += r.totalCollected;
    t.toCollect += r.outstanding;
    for (const it of r.plan) {
      if (it.state === "overdue") {
        t.overdue += it.amount;
        t.overdueCount++;
      }
      if (it.state === "due" && it.dueDate && it.dueDate <= in30) t.dueNext30 += it.amount;
    }
    by.set(cur, t);
  }
  // GBP first, then others.
  return [...by.values()].sort((a, b) => (a.currency === "GBP" ? -1 : b.currency === "GBP" ? 1 : a.currency.localeCompare(b.currency)));
}

/** Overdue first (most overdue on top), then upcoming by next due date, then settled. */
export function sortPaymentRows(rows: PaymentRow[]): PaymentRow[] {
  const rank: Record<PaymentState, number> = { overdue: 0, due: 1, no_due_date: 2, collected: 3, paid_in_full: 4 };
  return [...rows].sort((a, b) =>
    rank[a.state] - rank[b.state] ||
    (a.state === "overdue" ? b.daysOverdue - a.daysOverdue : 0) ||
    (a.next?.dueDate ?? "9999").localeCompare(b.next?.dueDate ?? "9999") ||
    b.collectedOn.localeCompare(a.collectedOn),
  );
}
