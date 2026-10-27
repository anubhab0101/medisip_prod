"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Home,
  MessageSquareText,
  MoreHorizontal,
  Pill,
  ReceiptText,
  Settings2,
  ShoppingCart,
  Users,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { T, useTranslation } from "@/lib/i18n/provider";
import { ThemeToggle } from "@/components/shared/theme-toggle";

type NavGroup = "daily" | "stock" | "more";
type NavItem = { href: string; label: string; group: NavGroup };

const icons: Record<string, LucideIcon> = {
  "/dashboard": Home,
  "/billing": ReceiptText,
  "/medicines": Pill,
  "/stock": Boxes,
  "/customers": Users,
  "/purchases": ShoppingCart,
  "/bills": ReceiptText,
  "/appointments": CalendarDays,
  "/notifications": MessageSquareText,
  "/reports": BarChart3,
  "/settings": Settings2,
};

const groups: { id: NavGroup; label: string }[] = [
  { id: "daily", label: "Daily work" },
  { id: "stock", label: "Stock" },
  { id: "more", label: "More" },
];

const phoneShortcuts = [
  { href: "/dashboard", label: "Today" },
  { href: "/billing", label: "Bill" },
  { href: "/stock", label: "Stock" },
  { href: "/customers", label: "People" },
];

export function WorkspaceNav({ links }: { links: NavItem[] }) {
  const pathname = usePathname();
  const t = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const active = links
    .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("medishop-sidebar") === "collapsed");
    } catch {
      setCollapsed(false);
    }
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem("medishop-sidebar", next ? "collapsed" : "expanded");
    } catch {
      // The visual preference still works when browser storage is unavailable.
    }
  }

  function renderLink(link: NavItem, mobile = false, displayLabel?: string) {
    const Icon = icons[link.href] ?? ReceiptText;
    const isActive = link.href === active;
    return (
      <Link
        key={`${mobile ? "mobile-" : ""}${link.href}`}
        href={link.href}
        className={isActive ? "nav-link active" : "nav-link"}
        aria-current={isActive ? "page" : undefined}
        aria-label={t(displayLabel ?? link.label)}
        title={t(displayLabel ?? link.label)}
        onClick={() => setMoreOpen(false)}
      >
        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        <span><T>{displayLabel ?? link.label}</T></span>
      </Link>
    );
  }

  const primaryLinks = phoneShortcuts
    .map((shortcut) => {
      const link = links.find((item) => item.href === shortcut.href);
      return link ? { link, label: shortcut.label } : null;
    })
    .filter((item): item is { link: NavItem; label: string } => !!item);
  const primaryPaths = new Set(primaryLinks.map(({ link }) => link.href));
  const moreLinks = links.filter((link) => !primaryPaths.has(link.href));
  const moreActive = moreLinks.some(
    (link) => active === link.href || pathname === "/help",
  );

  return (
    <>
      <nav className="app-nav" aria-label={t("Main menu")} data-collapsed={collapsed}>
        <button
          type="button"
          className="sidebar-collapse"
          onClick={toggleSidebar}
          aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
          title={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
          aria-pressed={collapsed}
        >
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          <span><T>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</T></span>
        </button>
        {groups.map((group) => {
          const items = links.filter((link) => link.group === group.id);
          if (!items.length) return null;
          return (
            <div className="nav-group" key={group.id}>
              <div className="nav-group-label"><T>{group.label}</T></div>
              {items.map((link) => renderLink(link))}
            </div>
          );
        })}
      </nav>

      <nav className="mobile-bottom-nav" aria-label={t("Main menu")}>
        {primaryLinks.map(({ link, label }) => renderLink(link, true, label))}
        <div className="mobile-more">
            <button
              type="button"
              className={moreActive ? "nav-link active" : "nav-link"}
              aria-expanded={moreOpen}
              aria-label={t("More sections")}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <MoreHorizontal size={19} aria-hidden="true" />
              <span><T>{"More"}</T></span>
            </button>
            {moreOpen && (
              <div className="mobile-more-menu">
                {moreLinks.map((link) => renderLink(link, true))}
                <Link className="nav-link" href="/help" onClick={() => setMoreOpen(false)}>
                  <span aria-hidden="true">?</span><span><T>{"Quick help"}</T></span>
                </Link>
                <div className="mobile-theme-toggle"><ThemeToggle /></div>
              </div>
            )}
        </div>
      </nav>
    </>
  );
}
