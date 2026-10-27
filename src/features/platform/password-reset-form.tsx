"use client";

import { useState, useTransition } from "react";
import { resetPlatformUserPassword } from "./actions";

export function PasswordResetForm({ branchId, userId }: { branchId: string; userId: string }) {
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function reset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPassword("");
    setNotice("");
    startTransition(async () => {
      try {
        setPassword(await resetPlatformUserPassword(form));
        setNotice("Temporary password created. Share it privately; the user must change it at next sign-in.");
      } catch {
        setNotice("Could not reset this password. Refresh the page and try again.");
      }
    });
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setNotice("Copied. Share this temporary password privately.");
    } catch {
      setNotice("Select and copy the temporary password above.");
    }
  }

  return (
    <div className="platform-password-reset">
      <form onSubmit={reset}>
        <input type="hidden" name="branchId" value={branchId} />
        <input type="hidden" name="userId" value={userId} />
        <button className="button secondary" type="submit" disabled={pending}>
          {pending ? "Resetting…" : "Reset password"}
        </button>
      </form>
      {password && (
        <div className="platform-temp-password">
          <label>Temporary password<input value={password} readOnly autoComplete="off" /></label>
          <button className="button secondary" type="button" onClick={copyPassword}>Copy</button>
        </div>
      )}
      {notice && <small role="status">{notice}</small>}
    </div>
  );
}
