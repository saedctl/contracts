import { z } from "zod";
import { CURRENCIES, PAYMENT_STATUSES } from "./types";

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
    duration: z.enum(["1", "3", "6", "12", "custom"], { message: "Choose a membership duration" }),
    startDate: isoDate,
    endDate: isoDate,
    amountPaid: money("Amount paid"),
    currency: z.enum(CURRENCIES),
    paymentStatus: z.enum(PAYMENT_STATUSES, { message: "Choose a payment status" }),
    paymentSchedule: z.string().trim().max(1000, "Payment schedule is too long").optional().default(""),
    outstandingBalance: money("Outstanding balance").optional().default(0),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
    }
    const max = new Date(v.startDate);
    max.setUTCFullYear(max.getUTCFullYear() + 5);
    if (new Date(v.endDate) > max) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Membership cannot be longer than 5 years" });
    }
    if (v.paymentStatus === "paid_in_full" && v.outstandingBalance > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["outstandingBalance"],
        message: "Outstanding balance should be 0 when the membership is paid in full",
      });
    }
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
