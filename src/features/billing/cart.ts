import { calculateBill } from "./pricing";
import type { CartLine } from "./types";
export function priceCart(cart: CartLine[], discount: number) {
  const lines = [];
  for (const entry of cart) {
    let remaining = entry.quantity;
    if (!Number.isSafeInteger(remaining) || remaining <= 0)
      throw new Error("Enter a whole quantity of at least 1.");
    for (const batch of entry.medicine.batches.filter(
      (b) => !entry.batchId || b.id === entry.batchId,
    )) {
      const take = Math.min(remaining, batch.qtyOnHand - batch.qtyReserved);
      if (take > 0)
        lines.push({
          unitPricePaise: batch.mrpPaise,
          quantity: take,
          gstBasisPoints: entry.medicine.gstBasisPoints,
          discountBasisPoints: entry.discountBasisPoints,
        });
      remaining -= take;
      if (remaining <= 0) break;
    }
    if (remaining > 0)
      throw new Error(`Not enough stock for ${entry.medicine.name}.`);
  }
  return calculateBill(lines, discount);
}
