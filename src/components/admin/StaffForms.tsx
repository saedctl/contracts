"use client";

import { useActionState } from "react";
import { createStaffAction, resetStaffPasswordAction, type ActionResult } from "@/app/actions/admin";
import { Alert, Button, Card, Field, Spinner } from "@/components/ui";

function Secret({ value }: { value: string }) {
  return <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="field-input mt-2 font-mono text-[14px]" aria-label="Temporary password" />;
}

export function NewStaffForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createStaffAction, {});
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-serif text-lg font-semibold">Add a team member</h2>
      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_180px_auto] sm:items-end">
        <Field label="Full name" htmlFor="fullName"><input id="fullName" name="fullName" required className="field-input" /></Field>
        <Field label="Work email" htmlFor="email"><input id="email" name="email" type="email" required className="field-input" /></Field>
        <Field label="Role" htmlFor="role">
          <select id="role" name="role" className="field-input" defaultValue="sales">
            <option value="sales">Sales</option>
            <option value="admin">Administrator</option>
          </select>
        </Field>
        <Button type="submit" disabled={pending}>{pending && <Spinner />} Add</Button>
      </form>
      {state.error && <Alert tone="error" className="mt-4">{state.error}</Alert>}
      {state.ok && (
        <Alert tone="success" className="mt-4">
          {state.message}
          {state.password && <Secret value={state.password} />}
          <p className="mt-2 text-[13px]">They should change it from the Account page after signing in.</p>
        </Alert>
      )}
    </Card>
  );
}

export function ResetPasswordButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(resetStaffPasswordAction, {});
  return (
    <form action={action} onSubmit={(e) => { if (!confirm("Reset this person's password? Their current password will stop working.")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-ink/5 hover:text-ink">Reset password</button>
      {state.password && <Secret value={state.password} />}
      {state.error && <p className="mt-1 text-[12px] text-red-800">{state.error}</p>}
    </form>
  );
}
