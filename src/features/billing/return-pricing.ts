import { roundedRatio } from "@/lib/money";
/** Cumulative rounding makes several partial returns equal one complete return. */
export function returnShare(
  totalPaise: number,
  quantity: number,
  alreadyReturned: number,
  returning: number,
) {
  if (
    ![totalPaise, quantity, alreadyReturned, returning].every(
      Number.isSafeInteger,
    ) ||
    totalPaise < 0 ||
    quantity < 1 ||
    alreadyReturned < 0 ||
    returning < 1 ||
    alreadyReturned + returning > quantity
  )
    throw new Error("Invalid return quantity");
  return (
    roundedRatio(
      BigInt(totalPaise) * BigInt(alreadyReturned + returning),
      BigInt(quantity),
    ) -
    roundedRatio(BigInt(totalPaise) * BigInt(alreadyReturned), BigInt(quantity))
  );
}
