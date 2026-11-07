import { z } from "zod";
import { CURRENCIES, MEMBERSHIP_TIERS, PAYMENT_STATUSES } from "./types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

const money = (label: string) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(1_000_000, `${label} looks too large`)
    .refine((n) => Math.round(n * 100) === Number((n * 100).toFixed(6)), `${label} can have at most 2 decimal places`);

export const contractInputSchema = z
  .object({
    customerName: z.string().trim().min(2, "Enter the customer's full name").max(120, "Name is too long"),
    customerEmail: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
    customerPhone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s().-]{7,24}$/, "Enter a valid phone number, e.g. +44 7700 900123"),
    membershipTier: z.enum(MEMBERSHIP_TIERS, { message: "Choose a membership tier" }),
    duration: z.enum(["1", "3", "6", "12", "lifetime", "custom"], { message: "Choose a membership duration" }),
    startDate: isoDate,
    /** Empty for a lifetime membership. */
    endDate: z.union([isoDate, z.literal("")]).optional().default(""),
    amountPaid: money("Amount paid"),
    /** Date the amount paid was received; may be backdated. Empty means the contract date. */
    amountPaidOn: z.union([isoDate, z.literal("")]).optional().default(""),
    currency: z.enum(CURRENCIES),
    paymentStatus: z.enum(PAYMENT_STATUSES, { message: "Choose a payment status" }),
    paymentSchedule: z.string().trim().max(1000, "Payment schedule is too long").optional().default(""),
    outstandingBalance: money("Outstanding balance").optional().default(0),
    balanceDueDate: z.union([isoDate, z.literal("")]).optional().default(""),
    /** Payment plan for the balance. When given, it defines the outstanding balance and due date. */
    instalments: z
      .array(z.object({ amount: money("Instalment amount"), dueDate: isoDate }))
      .max(24, "Use at most 24 instalments")
      .optional()
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.amountPaidOn && v.amountPaidOn > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: "custom", path: ["amountPaidOn"], message: "The payment date can't be in the future" });
    }
    if (v.duration !== "lifetime" && !v.endDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Enter a valid date" });
    }
    if (v.duration !== "lifetime" && v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
    }
    const max = new Date(v.startDate);
    max.setUTCFullYear(max.getUTCFullYear() + 5);
    if (v.duration !== "lifetime" && v.endDate && new Date(v.endDate) > max) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Membership cannot be longer than 5 years" });
    }
    if (v.paymentStatus !== "paid_in_full") {
      if (v.instalments.length === 0 && !(v.outstandingBalance > 0)) {
        ctx.addIssue({ code: "custom", path: ["instalments"], message: "Add at least one instalment for the balance still to be paid" });
      }
      v.instalments.forEach((it, i) => {
        if (!(it.amount > 0)) ctx.addIssue({ code: "custom", path: ["instalments", i, "amount"], message: "Enter an amount" });
      });
    }
    if (v.paymentStatus === "paid_in_full" && v.outstandingBalance > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["outstandingBalance"],
        message: "Outstanding balance should be 0 when the membership is paid in full",
      });
    }
  })
  .transform((v) => (v.duration === "lifetime" ? { ...v, endDate: "" } : v))
  .transform((v) => {
    if (v.paymentStatus === "paid_in_full") return { ...v, instalments: [], outstandingBalance: 0, balanceDueDate: "" };
    if (v.instalments.length === 0) return v;
    // The instalments are the source of truth for the balance and its final due date.
    const instalments = [...v.instalments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const total = Math.round(instalments.reduce((sum, it) => sum + it.amount, 0) * 100) / 100;
    return { ...v, instalments, outstandingBalance: total, balanceDueDate: instalments[instalments.length - 1].dueDate };
  });

export type ContractInput = z.infer<typeof contractInputSchema>;
export type ContractFormValues = z.input<typeof contractInputSchema>;

export type FieldErrors = Record<string, string>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
