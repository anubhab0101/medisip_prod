import { T } from "@/lib/i18n/provider";
export default function Loading() {
  return (
    <section className="page-skeleton" role="status" aria-busy="true">
      <span className="sr-only"><T>{"Loading page…"}</T></span>
      <div className="skeleton-title" aria-hidden="true" />
      <div className="skeleton-stats" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <div className="skeleton-panel" aria-hidden="true">
        <span /><span /><span />
      </div>
    </section>
  );
}
