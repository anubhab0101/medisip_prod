import { T } from "@/lib/i18n/provider";
export default function Loading() {
  return (
    <p role="status" className="notice">
      <T>{"Loading…"}</T>
    </p>
  );
}
