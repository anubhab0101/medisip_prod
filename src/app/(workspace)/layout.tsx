import { LocalizedNav } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";
import { LanguageSwitch } from "@/components/shared/language-switch";
import type { Metadata } from "next";
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
import Link from "next/link";
import { context } from "@/server/context";
import { can, Permission } from "@/lib/permissions";
import { logoutAction, switchBranch } from "@/features/auth/actions";
const links = [
  { href: "/dashboard", label: "Home", permission: Permission.DASHBOARD },
  { href: "/billing", label: "New bill", permission: Permission.BILL },
  { href: "/medicines", label: "Medicines", permission: Permission.STOCK_READ },
  { href: "/stock", label: "Stock", permission: Permission.STOCK_READ },
  { href: "/customers", label: "Customers", permission: Permission.CUSTOMER },
  {
    href: "/purchases",
    label: "Purchases",
    permission: Permission.STOCK_WRITE,
  },
  { href: "/bills", label: "Bills", permission: Permission.BILL },
  {
    href: "/appointments",
    label: "Appointments",
    permission: Permission.APPOINTMENT,
  },
  {
    href: "/notifications",
    label: "Messages",
    permission: Permission.MESSAGES,
  },
  { href: "/reports", label: "Reports", permission: Permission.REPORT },
  { href: "/settings", label: "Settings", permission: Permission.SETTINGS },
];
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await context();
  return (
    <div className="workspace">
      <header className="app-header">
        <Link href="/dashboard" className="brand">
          MediShop
        </Link>
        <span className="shop-name">{ctx.branch.name}</span>
        <div className="user-menu">
          <LanguageSwitch />
          {ctx.memberships.length > 1 && (
            <form action={switchBranch} className="inline">
              <label>
                <span className="sr-only">
                  <T>{"Shop"}</T>
                </span>
                <select name="branchId" defaultValue={ctx.branch.id}>
                  {ctx.memberships.map((m) => (
                    <option key={m.branchId} value={m.branchId}>
                      {m.branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button secondary">
                <T>{"Switch"}</T>
              </button>
            </form>
          )}
          <Link className="text-link" href="/help">
            <T>{"Help"}</T>
          </Link>
          <span>{ctx.user.name}</span>
          <form action={logoutAction}>
            <button className="button secondary">
              <T>{"Sign out"}</T>
            </button>
          </form>
        </div>
      </header>
      <LocalizedNav className="app-nav" aria-label="Main menu">
        {links
          .filter(
            (link) =>
              can(ctx.role, link.permission) ||
              (link.href === "/appointments" &&
                can(ctx.role, Permission.DOCTOR_OWN)),
          )
          .map((link) => (
            <Link key={link.href} href={link.href}>
              <T>{link.label}</T>
            </Link>
          ))}
      </LocalizedNav>
      {ctx.branch.demo && (
        <div className="demo-banner">
          <T>{"Practice shop · Sample records only · Messages are disabled"}</T>
        </div>
      )}
      <main className="app-main">{children}</main>
    </div>
  );
}
