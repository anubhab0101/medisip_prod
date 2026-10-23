import { integer, roundedRatio } from "./money";
export function calculateLine(
  unitPricePaise: number,
  quantity: number,
  gstBasisPoints: number,
  discountBasisPoints = 0,
) {
  integer(unitPricePaise);
  integer(quantity);
  integer(gstBasisPoints);
  integer(discountBasisPoints);
  if (quantity === 0 || gstBasisPoints > 10000 || discountBasisPoints > 10000)
    throw new Error("Invalid quantity or rate");
  const grossPaise = integer(Number(BigInt(unitPricePaise) * BigInt(quantity)));
  const discountPaise = roundedRatio(
    BigInt(grossPaise) * BigInt(discountBasisPoints),
    10000n,
  );
  const totalPaise = grossPaise - discountPaise;
  const taxablePaise = roundedRatio(
    BigInt(totalPaise) * 10000n,
    10000n + BigInt(gstBasisPoints),
  );
  const gstPaise = totalPaise - taxablePaise;
  const cgstPaise = roundedRatio(BigInt(gstPaise), 2n);
  return {
    grossPaise,
    discountPaise,
    taxablePaise,
    cgstPaise,
    sgstPaise: gstPaise - cgstPaise,
    totalPaise,
  };
}
export function roundBill(totalPaise: number) {
  integer(totalPaise);
  const roundedPaise = integer(roundedRatio(BigInt(totalPaise), 100n) * 100);
  return { totalPaise: roundedPaise, roundOffPaise: roundedPaise - totalPaise };
}
