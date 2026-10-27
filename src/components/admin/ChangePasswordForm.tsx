"use client";

import { useActionState } from "react";
import { changePasswordAction, type ActionResult } from "@/app/actions/admin";
import { Alert, Button, Field, Spinner } from "@/components/ui";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="mt-5 space-y-4">
      <Field label="Current password" htmlFor="current"><input id="current" name="current" type="password" autoComplete="current-password" required className="field-input" /></Field>
      <Field label="New password" htmlFor="next" hint="At least 12 characters, with letters and numbers."><input id="next" name="next" type="password" autoComplete="new-password" required minLength={12} className="field-input" /></Field>
      <Field label="Confirm new password" htmlFor="confirm"><input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="field-input" /></Field>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      <Button type="submit" disabled={pending}>{pending && <Spinner />} Update password</Button>
    </form>
  );
}
