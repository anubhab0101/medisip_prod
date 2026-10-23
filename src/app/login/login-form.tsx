"use client";
import { T } from "@/lib/i18n/provider";

import { useActionState } from "react";
import { loginAction } from "@/features/auth/actions";
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return (
    <form action={action} className="stack">
      <label>
        <T>{"Email"}</T>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={191}
        />
      </label>
      <label>
        <T>{"Password"}</T>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={72}
        />
      </label>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <button className="button" disabled={pending}>
        <T>{pending ? "Signing in…" : "Sign in"}</T>
      </button>
    </form>
  );
}
