// Cash collected / to be collected for signed contracts. Pure (usable on server and client).

import type { Contract, Currency } from "./types";

export type PaymentState = "paid_in_full" | "collected" | "due" | "overdue" | "no_due_date";

export interface PaymentRow {
  contract: Contract;
  /** Collected when the contract was issued. */
  collectedAtSigning: number;
  collectedOn: string; // YYYY-MM-DD
  outstanding: number; // still to collect (0 once collected)
  balance: number; // original outstanding balance
  dueDate: string | null;
  balanceCollectedOn: string | null;
  totalCollected: number;
  state: PaymentState;
  daysOverdue: number;
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  paid_in_full: "Paid in full",
  collected: "Balance collected",
  due: "Due",
  overdue: "Overdue",
  no_due_date: "Due — no date",
};

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function paymentRow(c: Contract, today: string): PaymentRow {
  const balance = c.outstandingBalance > 0 ? c.outstandingBalance : 0;
  const balanceCollected = balance > 0 && !!c.balanceCollectedAt;
  const outstanding = balance > 0 && !balanceCollected ? balance : 0;
  const due = c.balanceDueDate;
  let state: PaymentState;
  if (balance === 0) state = "paid_in_full";
  else if (balanceCollected) state = "collected";
  else if (!due) state = "no_due_date";
  else if (due < today) state = "overdue";
  else state = "due";
  return {
    contract: c,
    collectedAtSigning: c.amountPaid,
    collectedOn: c.createdAt.slice(0, 10),
    outstanding,
    balance,
    dueDate: due,
    balanceCollectedOn: c.balanceCollectedAt ? c.balanceCollectedAt.slice(0, 10) : null,
    totalCollected: c.amountPaid + (balanceCollected ? balance : 0),
    state,
    daysOverdue: state === "overdue" && due ? daysBetween(due, today) : 0,
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
    if (r.state === "overdue") {
      t.overdue += r.outstanding;
      t.overdueCount++;
    }
    if (r.state === "due" && r.dueDate && r.dueDate <= in30) t.dueNext30 += r.outstanding;
    by.set(cur, t);
  }
  // GBP first, then others.
  return [...by.values()].sort((a, b) => (a.currency === "GBP" ? -1 : b.currency === "GBP" ? 1 : a.currency.localeCompare(b.currency)));
}

/** Overdue first (most overdue on top), then upcoming by due date, then settled. */
export function sortPaymentRows(rows: PaymentRow[]): PaymentRow[] {
  const rank: Record<PaymentState, number> = { overdue: 0, due: 1, no_due_date: 2, collected: 3, paid_in_full: 4 };
  return [...rows].sort((a, b) =>
    rank[a.state] - rank[b.state] ||
    (a.state === "overdue" ? b.daysOverdue - a.daysOverdue : 0) ||
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
    b.collectedOn.localeCompare(a.collectedOn),
  );
}
