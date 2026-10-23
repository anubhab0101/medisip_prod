import { T } from "@/lib/i18n/provider";
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading workspace">
      <p role="status">
        <T>{"Opening your workspace…"}</T>
      </p>
    </main>
  );
}
