import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/utils";
import { NewContractFlow } from "@/components/contracts/NewContractFlow";

export const metadata: Metadata = { title: "New contract" };

export default async function NewContractPage() {
  await requireUser();
  return <NewContractFlow today={todayISO()} />;
}
