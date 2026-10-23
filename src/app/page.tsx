import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Metadata } from "next";
export const metadata: Metadata = { alternates: { canonical: "/" } };
export default async function Home() {
  if (process.env.AUTH_SECRET && (await auth())?.user) redirect("/dashboard");
  return (
    <div className="workspace">
      <header className="app-header">
        <Link className="brand" href="/">
          MediShop
        </Link>
        <Link className="button" href="/login">
          <T>{"Sign in"}</T>
        </Link>
      </header>
      <main className="app-main welcome">
        <div className="page-title">
          <div>
            <h1>
              <T>{"Your pharmacy, simplified."}</T>
            </h1>
            <p>
              <T>{"Medicines, stock and billing in one place."}</T>
            </p>
          </div>
        </div>
        <section className="panel">
          <h2>
            <T>{"Open your shop"}</T>
          </h2>
          <p>
            <T>{"Sign in to manage your pharmacy."}</T>
          </p>
          <div className="inline">
            <Link className="button" href="/login">
              <T>{"Sign in"}</T>
            </Link>
          </div>
        </section>
        <section className="panel">
          <h2>
            <T>{"Daily work, in one place"}</T>
          </h2>
          <p>
            <T>
              {
                "Create bills, track batches and expiry, receive stock, manage doctor appointments and keep customers informed."
              }
            </T>
          </p>
        </section>
      </main>
    </div>
  );
}
