import { integer } from "./money";
export interface StockBatch {
  id: string;
  expiryDate: string;
  qtyOnHand: number;
}
function validDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error("Invalid stock date");
}
/** Expiry is valid through the final calendar date in the shop timezone. */
export function allocateFefo(
  batches: StockBatch[],
  quantity: number,
  today: string,
) {
  integer(quantity);
  validDate(today);
  if (!quantity) throw new Error("Quantity must be positive");
  const ids = new Set<string>();
  for (const batch of batches) {
    validDate(batch.expiryDate);
    integer(batch.qtyOnHand);
    if (ids.has(batch.id)) throw new Error("Duplicate batch");
    ids.add(batch.id);
  }
  const eligible = batches
    .filter((batch) => batch.expiryDate >= today && batch.qtyOnHand > 0)
    .sort(
      (a, b) =>
        a.expiryDate.localeCompare(b.expiryDate) || a.id.localeCompare(b.id),
    );
  let remaining = quantity;
  const allocations: { batchId: string; quantity: number }[] = [];
  for (const batch of eligible) {
    const take = Math.min(batch.qtyOnHand, remaining);
    if (take) allocations.push({ batchId: batch.id, quantity: take });
    remaining -= take;
    if (!remaining) break;
  }
  if (remaining)
    throw new Error(
      "Not enough unexpired stock. Reduce quantity or add stock.",
    );
  return allocations;
}
