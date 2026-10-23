import { z } from "zod";
import { shopDate } from "@/lib/date";
export const reportKinds = [
  "sales",
  "gst",
  "profit",
  "products",
  "slow",
  "expiry",
  "purchases",
  "purchase-sales",
  "expiry-loss",
  "staff",
  "credit",
] as const;
export function reportRange(raw: Record<string, string | undefined>) {
  const kind = z.enum(reportKinds).catch("sales").parse(raw.kind);
  const from = raw.from || raw.date || shopDate();
  const to = raw.to || from;
  const start = new Date(`${from}T00:00:00+05:30`),
    last = new Date(`${to}T00:00:00+05:30`);
  if (
    ![from, to].every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)) ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(last.getTime()) ||
    shopDate(start) !== from ||
    shopDate(last) !== to ||
    last < start ||
    last.getTime() - start.getTime() > 365 * 86400000
  )
    throw new Error("Choose valid dates spanning no more than one year.");
  return { kind, from, to, start, end: new Date(last.getTime() + 86400000) };
}
export const reportLabels: Record<(typeof reportKinds)[number], string> = {
  sales: "Sales & refunds",
  gst: "GST by HSN",
  profit: "Gross profit",
  products: "Top medicines",
  slow: "Slow medicines",
  expiry: "Expiry & stock",
  purchases: "Purchases",
  "purchase-sales": "Purchases vs sales",
  "expiry-loss": "Expiry write-offs",
  staff: "Sales by staff",
  credit: "Outstanding credit",
};
