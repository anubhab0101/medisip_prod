import { T } from "@/lib/i18n/provider";
import { LanguageSwitch } from "@/components/shared/language-switch";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};
import Link from "next/link";
import { LoginForm } from "./login-form";
export default function LoginPage() {
  const ready = Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET);
  return (
    <main className="login-page">
      <section className="panel login-card">
        <LanguageSwitch />
        <Link className="brand" href="/">
          MediShop
        </Link>
        <h1>
          <T>{"Welcome back"}</T>
        </h1>
        <p>
          <T>{"Sign in to your pharmacy."}</T>
        </p>
        {!ready && (
          <p className="notice">
            <T>
              {
                "Your shop is not connected yet. The owner needs to finish setup before you can sign in."
              }
            </T>
          </p>
        )}
        <LoginForm />
        <Link className="text-link" href="/">
          <T>{"Back to overview"}</T>
        </Link>
      </section>
    </main>
  );
}
