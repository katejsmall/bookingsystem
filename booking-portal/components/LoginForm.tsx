"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { PillPrimaryButton, pillInputCls } from "@/components/ui";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    null
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="EMAIL"
          className={pillInputCls}
        />
      </div>
      <div>
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="PASSWORD"
          className={pillInputCls}
        />
      </div>
      {state?.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex justify-end pt-2">
        <PillPrimaryButton type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </PillPrimaryButton>
      </div>
    </form>
  );
}
