import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { Card } from "@/components/ui";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold">{user.fullName}</h1>
        <p className="mt-1 text-[15px] text-muted">{user.email} · {user.role === "admin" ? "Administrator" : "Sales"}</p>
      </div>
      <Card className="p-5 sm:p-7">
        <h2 className="font-serif text-lg font-semibold">Change password</h2>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
