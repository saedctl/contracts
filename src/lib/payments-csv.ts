// CSV export of payments for bookkeeping: one line per payment (upfront + each instalment).

import { fxOf, toReporting, type FxRates } from "./fx";
import { INSTALMENT_STATE_LABELS, type PaymentRow } from "./payments";

/** Quotes a cell, and neutralises values a spreadsheet would run as a formula. */
function cell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const money = (n: number | null) => (n === null ? "" : n.toFixed(2));

export function paymentsCsv(rows: PaymentRow[], rates: FxRates): string {
  const header = [
    "Reference", "Member", "Email", "Sales rep", "Membership tier", "Payment", "Currency", "Amount",
    "Amount (GBP)", "Exchange rate to GBP", "Rate date", "Due date", "Collected on", "Status",
  ];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    const c = r.contract;
    const fx = fxOf(c, rates);
    const base = [c.reference, c.customerName, c.customerEmail, c.createdByName ?? "", c.fieldValues.membership_tier ?? ""];
    const fxCols = (amount: number) => [
      money(toReporting(amount, c, rates)),
      c.currency === "GBP" ? "" : fx ? String(fx.rate) : "pending",
      fx?.rateDate ?? "",
    ];
    if (r.collectedAtSigning > 0) {
      lines.push([...base, "Upfront payment", c.currency, money(r.collectedAtSigning), ...fxCols(r.collectedAtSigning), "", r.collectedOn, "Collected"].map(cell).join(","));
    }
    r.plan.forEach((it, i) => {
      const label = r.plan.length > 1 ? `Instalment ${i + 1} of ${r.plan.length}` : "Balance";
      lines.push([
        ...base, label, c.currency, money(it.amount), ...fxCols(it.amount),
        it.dueDate ?? "", it.collectedAt?.slice(0, 10) ?? "", INSTALMENT_STATE_LABELS[it.state],
      ].map(cell).join(","));
    });
  }
  // BOM so Excel reads £ and names with accents correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
