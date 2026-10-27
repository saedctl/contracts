import "server-only";
import { BRAND } from "../brand";
import { describeTerm } from "../dates";
import { PAYMENT_STATUS_LABELS, type FieldValues } from "../types";
import { formatLongDate, formatMoney, todayISO } from "../utils";
import type { ContractInput } from "../validation";

/** Formats the approved placeholder values for a contract. Frozen onto the contract at generation. */
export function buildFieldValues(input: ContractInput, reference: string, issuedOn = todayISO()): FieldValues {
  const duration =
    input.duration === "custom"
      ? describeTerm(input.startDate, input.endDate)
      : `${input.duration} month${input.duration === "1" ? "" : "s"}`;
  return {
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    customer_phone: input.customerPhone,
    membership_start_date: formatLongDate(input.startDate),
    membership_end_date: formatLongDate(input.endDate),
    membership_duration: duration,
    amount_paid: formatMoney(input.amountPaid, input.currency),
    currency: input.currency,
    payment_status: PAYMENT_STATUS_LABELS[input.paymentStatus],
    outstanding_balance: formatMoney(input.outstandingBalance ?? 0, input.currency),
    payment_schedule: input.paymentSchedule?.trim() || "Not applicable",
    contract_reference: reference,
    contract_date: formatLongDate(issuedOn),
    company_name: BRAND.legalName,
    business_name: BRAND.name,
    community_url: BRAND.website,
  };
}
