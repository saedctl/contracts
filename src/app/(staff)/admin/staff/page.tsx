import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { updateStaffAction } from "@/app/actions/admin";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui";
import { NewStaffForm, ResetPasswordButton } from "@/components/admin/StaffForms";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const admin = await requireAdmin();
  const staff = await (await getStore()).listStaff();
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold sm:text-[32px]">Staff accounts</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted">Sales reps can create contracts and see their own. Administrators see every contract and manage templates, staff and the audit log.</p>
      </div>

      <NewStaffForm />

      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0 text-[14px]">
                <p className="font-medium">
                  {s.fullName}
                  {s.id === admin.id && <span className="ml-2 text-[12px] text-muted">(you)</span>}
                  {!s.active && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] text-zinc-600">Deactivated</span>}
                </p>
                <p className="text-[13px] text-muted">{s.email} · added {formatDateTime(s.createdAt)}</p>
              </div>
              {s.id !== admin.id && (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={updateStaffAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <select name="role" defaultValue={s.role} className="field-input w-auto py-1.5 text-[13px]" aria-label={`Role for ${s.fullName}`}>
                      <option value="sales">Sales</option>
                      <option value="admin">Administrator</option>
                    </select>
                    <button className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-paper">Save</button>
                  </form>
                  <form action={updateStaffAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                    <button className={s.active ? "rounded-lg px-3 py-1.5 text-[13px] font-medium text-red-800 hover:bg-red-50" : "rounded-lg px-3 py-1.5 text-[13px] font-medium text-emerald-800 hover:bg-emerald-50"}>
                      {s.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                  {s.active && <ResetPasswordButton id={s.id} />}
                </div>
              )}
              {s.id === admin.id && <span className="text-[13px] text-muted">Administrator</span>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
