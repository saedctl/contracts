"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button, Field, LockIcon, Spinner } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <Field label="Work email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus placeholder="you@theengineers.club" defaultValue={state.email} className="field-input" aria-invalid={!!state.error} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required placeholder="Enter password" className="field-input" aria-invalid={!!state.error} aria-describedby={state.error ? "login-error" : undefined} />
      </Field>
      {state.error && (
        <p id="login-error" role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-800">{state.error}</p>
      )}
      <Button type="submit" className="w-full py-3" disabled={pending}>
        {pending && <Spinner />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="flex items-center justify-center gap-2 pt-1 text-[14px] text-muted">
        <LockIcon /> Internal tool — authorised staff only
      </p>
    </form>
  );
}
