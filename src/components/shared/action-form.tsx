"use client";
import { T } from "@/lib/i18n/provider";

import { useActionState } from "react";
export type FormState = { error: string; success?: string; id?: string };
export function ActionForm({
  action,
  children,
  label = "Save",
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: React.ReactNode;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  return (
    <form action={formAction} className="stack">
      <fieldset disabled={pending}>{children}</fieldset>
      {state.error && (
        <p role="alert" className="error">
          <T>{state.error}</T>
        </p>
      )}
      {state.success && (
        <p role="status" className="success">
          <T>{state.success}</T>
        </p>
      )}
      <button className="button" disabled={pending}>
        <T>{pending ? "Saving…" : label}</T>
      </button>
    </form>
  );
}
