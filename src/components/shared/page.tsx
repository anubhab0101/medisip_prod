import { LocalizedInput, LocalizedNav } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";
import Link from "next/link";
export function ListToolbar({
  q,
  placeholder = "Search",
  filters = {},
}: {
  q: string;
  placeholder?: string;
  filters?: Record<string, string>;
}) {
  return (
    <form className="toolbar" method="get">
      {Object.entries(filters).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label className="search-label">
        <span className="sr-only">
          <T>{"Search"}</T>
        </span>
        <LocalizedInput
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          maxLength={100}
        />
      </label>
      <button className="button secondary">
        <T>{"Search"}</T>
      </button>
      {q && (
        <Link className="text-link" href="?">
          <T>{"Clear"}</T>
        </Link>
      )}
    </form>
  );
}
export function Pagination({
  page,
  count,
  q,
  filters = {},
}: {
  page: number;
  count: number;
  q: string;
  filters?: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(count / 20));
  const link = (next: number) =>
    `?${new URLSearchParams({ ...filters, q, page: String(next) })}`;
  return (
    <LocalizedNav className="pagination" aria-label="Pages">
      {page > 1 && (
        <Link href={link(page - 1)}>
          <T>{"Previous"}</T>
        </Link>
      )}
      <span>
        <T>{"Page "}</T>
        {page}
        <T>{" of "}</T>
        {pages} · {count}
        <T>{" results"}</T>
      </span>
      {page < pages && (
        <Link href={link(page + 1)}>
          <T>{"Next"}</T>
        </Link>
      )}
    </LocalizedNav>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>
          <T>{title}</T>
        </h1>
        {description && (
          <p>
            <T>{description}</T>
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
