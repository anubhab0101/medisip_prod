import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { changeInitialPassword } from "@/features/auth/password-actions";

export default async function PasswordChangePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { error } = await searchParams;
  return <main className="auth-page"><section className="panel auth-card">
    <h1>Set a new password</h1>
    <p>Your administrator created this account. Change the temporary password to continue.</p>
    {error && <p className="form-error" role="alert">{error === "current" ? "Current password is incorrect." : "Passwords must match and the new password must be at least 12 characters."}</p>}
    <form action={changeInitialPassword} className="stack-form">
      <label className="field">Current password<input name="current" type="password" autoComplete="current-password" required /></label>
      <label className="field">New password<input name="next" type="password" autoComplete="new-password" minLength={12} required /></label>
      <label className="field">Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={12} required /></label>
      <button className="button primary">Save new password</button>
    </form>
  </section></main>;
}
