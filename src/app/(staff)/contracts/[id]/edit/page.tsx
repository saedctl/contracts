import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getContractForStaff } from "@/lib/services/contracts";
import type { Contract } from "@/lib/types";
import { todayISO } from "@/lib/utils";
import { NewContractFlow, type ContractFormState } from "@/components/contracts/NewContractFlow";

export const metadata: Metadata = { title: "Edit draft" };

/** Turns a saved draft back into the values the create form works with. */
function formValues(c: Contract): ContractFormState {
  const tierLabel = c.fieldValues.membership_tier;
  const plan = c.instalments.length
    ? c.instalments.map((it) => ({ amount: String(it.amount), dueDate: it.dueDate }))
    : c.outstandingBalance > 0
      ? [{ amount: String(c.outstandingBalance), dueDate: c.balanceDueDate ?? "" }]
      : [];
  return {
    customerName: c.customerName,
    customerEmail: c.customerEmail,
    customerPhone: c.customerPhone,
    membershipTier: tierLabel === "VIP" ? "vip" : tierLabel === "Premium" ? "premium" : "",
    duration: c.durationMonths ? String(c.durationMonths) : c.endDate ? "custom" : "lifetime",
    startDate: c.startDate,
    endDate: c.endDate ?? "",
    amountPaid: String(c.amountPaid),
    amountPaidOn: c.amountPaidOn ?? c.createdAt.slice(0, 10),
    currency: c.currency,
    paymentStatus: c.paymentStatus,
    paymentSchedule: c.paymentSchedule ?? "",
    outstandingBalance: "",
    balanceDueDate: "",
    instalments: c.paymentStatus === "paid_in_full" ? [] : plan,
  };
}

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const c = await getContractForStaff(user, (await params).id);
  if (!c) notFound();
  // Once sent, the agreement is fixed: show the contract instead.
  if (c.status !== "draft" || c.providerRequestId) redirect(`/contracts/${c.id}`);
  return <NewContractFlow today={todayISO()} draft={{ id: c.id, reference: c.reference, values: formValues(c) }} />;
}
