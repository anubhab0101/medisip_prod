import { T } from "@/lib/i18n/provider";
import { LanguageSwitch } from "@/components/shared/language-switch";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { WorkspaceNav } from "@/components/shared/workspace-nav";
import type { Metadata } from "next";
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
import Link from "next/link";
import { context } from "@/server/context";
import { can, Permission } from "@/lib/permissions";
import { logoutAction, switchBranch } from "@/features/auth/actions";
const links = [
  { href: "/dashboard", label: "Today", group: "daily", permission: Permission.DASHBOARD },
  { href: "/billing", label: "New bill", group: "daily", permission: Permission.BILL },
  { href: "/bills", label: "Bills", group: "daily", permission: Permission.BILL },
  { href: "/customers", label: "Customers", group: "daily", permission: Permission.CUSTOMER },
  { href: "/appointments", label: "Appointments", group: "daily", permission: Permission.APPOINTMENT },
  { href: "/prescriptions", label: "Prescriptions", group: "daily", permission: Permission.PRESCRIPTION },
  { href: "/medicines", label: "Medicines", group: "stock", permission: Permission.STOCK_READ },
  { href: "/stock", label: "Stock", group: "stock", permission: Permission.STOCK_READ },
  {
    href: "/purchases",
    label: "Purchases",
    group: "stock",
    permission: Permission.STOCK_WRITE,
  },
  {
    href: "/notifications",
    label: "Messages",
    group: "more",
    permission: Permission.MESSAGES,
  },
  { href: "/reports", label: "Reports", group: "more", permission: Permission.REPORT },
  { href: "/settings", label: "Settings", group: "more", permission: Permission.SETTINGS },
] as const;
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await context();
  const visibleLinks = links.filter(
    (link) =>
      can(ctx.role, link.permission) ||
      (link.href === "/appointments" && can(ctx.role, Permission.DOCTOR_OWN)),
  );
  return (
    <div className="workspace">
      <header className="app-header">
        <div className="app-brand-block">
          <Link href="/dashboard" className="brand">
            <span className="brand-mark" aria-hidden="true">+</span>
            <span className="brand-wordmark">MediShop</span>
          </Link>
          <span className="shop-name">{ctx.branch.name}</span>
        </div>
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
          <form action={logoutAction}>
            <button className="button secondary">
              <T>{"Sign out"}</T>
            </button>
          </form>
        </div>
      </header>
      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <div className="sidebar-heading"><T>{"Workspace"}</T></div>
          <WorkspaceNav links={visibleLinks} />
          <div className="sidebar-footer">
            <ThemeToggle />
            <Link className="sidebar-help" href="/help">
              <span aria-hidden="true">?</span><T>{"Quick help"}</T>
            </Link>
            <div className="sidebar-user">
              <span>{ctx.user.name}</span>
              <small><T>{ctx.role === "OWNER" ? "Owner" : ctx.role === "DOCTOR" ? "Doctor" : "Staff"}</T></small>
            </div>
          </div>
        </aside>
        <div className="workspace-content">
          {ctx.branch.demo && (
            <div className="demo-banner">
              <T>{"Practice shop · Sample records only · Messages are disabled"}</T>
            </div>
          )}
          <main className="app-main">{children}</main>
        </div>
      </div>
    </div>
  );
}
