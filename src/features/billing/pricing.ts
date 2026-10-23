import { calculateLine, roundBill } from "@/lib/gst";
import { integer } from "@/lib/money";
export type PricingInput = {
  unitPricePaise: number;
  quantity: number;
  gstBasisPoints: number;
  discountBasisPoints: number;
};
export function calculateBill(inputs: PricingInput[], billDiscountPaise = 0) {
  if (!inputs.length) throw new Error("Add a medicine first");
  integer(billDiscountPaise);
  const base = inputs.map((i) =>
    calculateLine(
      i.unitPricePaise,
      i.quantity,
      i.gstBasisPoints,
      i.discountBasisPoints,
    ),
  );
  const sum = integer(base.reduce((n, line) => n + line.totalPaise, 0));
  if (billDiscountPaise > sum) throw new Error("Discount exceeds bill total");
  let remaining = billDiscountPaise;
  const allocated = base.map((line) =>
    sum
      ? Number(
          (BigInt(billDiscountPaise) * BigInt(line.totalPaise)) / BigInt(sum),
        )
      : 0,
  );
  remaining -= allocated.reduce((a, b) => a + b, 0);
  for (let i = 0; remaining > 0; i = (i + 1) % allocated.length)
    if (allocated[i] < base[i].totalPaise) {
      allocated[i]++;
      remaining--;
    }
  const lines = inputs.map((input, i) => {
    const inclusive = base[i].totalPaise - allocated[i];
    const tax = calculateLine(inclusive, 1, input.gstBasisPoints);
    return {
      ...tax,
      grossPaise: base[i].grossPaise,
      discountPaise: base[i].discountPaise + allocated[i],
    };
  });
  const subtotalPaise = integer(base.reduce((sum, l) => sum + l.grossPaise, 0));
  const taxablePaise = integer(
    lines.reduce((sum, l) => sum + l.taxablePaise, 0),
  );
  const cgstPaise = integer(lines.reduce((sum, l) => sum + l.cgstPaise, 0));
  const sgstPaise = integer(lines.reduce((sum, l) => sum + l.sgstPaise, 0));
  const discountPaise = integer(
    lines.reduce((sum, l) => sum + l.discountPaise, 0),
  );
  return {
    lines,
    subtotalPaise,
    taxablePaise,
    cgstPaise,
    sgstPaise,
    discountPaise,
    ...roundBill(sum - billDiscountPaise),
  };
}
