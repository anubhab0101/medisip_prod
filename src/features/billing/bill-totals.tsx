import { T } from "@/lib/i18n/provider";
import { formatMoney } from "@/lib/money";
import type { priceCart } from "./cart";
export function BillTotals({
  totals,
}: {
  totals: ReturnType<typeof priceCart>;
}) {
  return (
    <div className="totals">
      {[
        ["Subtotal", totals.subtotalPaise],
        ["Discount", totals.discountPaise],
        ["GST included", totals.cgstPaise + totals.sgstPaise],
        ["Round-off", totals.roundOffPaise],
      ].map(([label, amount]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{formatMoney(Number(amount))}</strong>
        </div>
      ))}
      <div className="grand">
        <span>
          <T>{"Total"}</T>
        </span>
        <strong>{formatMoney(totals.totalPaise)}</strong>
      </div>
    </div>
  );
}
