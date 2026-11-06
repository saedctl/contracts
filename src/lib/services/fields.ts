import "server-only";
import { BRAND } from "../brand";
import { describeTerm } from "../dates";
import { MEMBERSHIP_TIER_LABELS, PAYMENT_STATUS_LABELS, type FieldValues } from "../types";
import { formatLongDate, formatMoney, todayISO } from "../utils";
import type { ContractInput } from "../validation";

/** Formats the approved placeholder values for a contract. Frozen onto the contract at generation. */
export function buildFieldValues(input: ContractInput, reference: string, issuedOn = todayISO()): FieldValues {
  const duration =
    input.duration === "custom"
      ? describeTerm(input.startDate, input.endDate)
      : `${input.duration} month${input.duration === "1" ? "" : "s"}`;
  const outstanding = input.paymentStatus === "paid_in_full" ? 0 : (input.outstandingBalance ?? 0);
  const paidOn = formatLongDate(issuedOn);
  const dueDate = outstanding > 0 && input.balanceDueDate ? formatLongDate(input.balanceDueDate) : "";
  const plan = outstanding > 0 ? input.instalments : [];
  const schedule = plan.length
    ? plan.map((it) => `${formatMoney(it.amount, input.currency)} due ${formatLongDate(it.dueDate)}`).join("\n")
    : "";
  const paymentSummary =
    outstanding <= 0
      ? `The Client has paid ${formatMoney(input.amountPaid, input.currency)} in full on ${paidOn}.`
      : plan.length > 1
        ? `The Client has paid ${formatMoney(input.amountPaid, input.currency)} on ${paidOn}, with a remaining balance of ${formatMoney(outstanding, input.currency)} payable in ${plan.length} instalments, the final one due by ${dueDate}.`
        : `The Client has paid ${formatMoney(input.amountPaid, input.currency)} on ${paidOn}, with a remaining balance of ${formatMoney(outstanding, input.currency)}${dueDate ? ` due by ${dueDate}` : ""}.`;
  return {
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    customer_phone: input.customerPhone,
    membership_start_date: formatLongDate(input.startDate),
    membership_end_date: formatLongDate(input.endDate),
    membership_duration: duration,
    membership_tier: MEMBERSHIP_TIER_LABELS[input.membershipTier],
    amount_paid: formatMoney(input.amountPaid, input.currency),
    currency: input.currency,
    payment_status: PAYMENT_STATUS_LABELS[input.paymentStatus],
    outstanding_balance: formatMoney(input.outstandingBalance ?? 0, input.currency),
    payment_schedule: input.paymentSchedule?.trim() || schedule || "Not applicable",
    instalment_count: plan.length ? String(plan.length) : "",
    total_fee: formatMoney(input.amountPaid + outstanding, input.currency),
    balance_due_date: dueDate || "Not applicable",
    payment_summary: paymentSummary,
    contract_reference: reference,
    contract_date: formatLongDate(issuedOn),
    company_name: BRAND.legalName,
    company_number: BRAND.companyNumber,
    business_name: BRAND.name,
    community_url: BRAND.website,
  };
}
