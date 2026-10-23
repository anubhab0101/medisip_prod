import "server-only";
import type { Prisma, SaleItem } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
export async function lockLoyalty(
  tx: Prisma.TransactionClient,
  branchId: string,
  customerId: string,
) {
  await tx.$queryRaw`SELECT id FROM Customer WHERE id=${customerId} AND branchId=${branchId} FOR UPDATE`;
  const entries = await tx.$queryRaw<
    { points: number }[]
  >`SELECT points FROM LoyaltyEntry WHERE branchId=${branchId} AND customerId=${customerId} FOR UPDATE`;
  return entries.reduce((n, e) => n + e.points, 0);
}
export async function redeemLoyalty(
  tx: Prisma.TransactionClient,
  branchId: string,
  customerId: string,
  points: number,
  balance: number,
  saleId: string,
  operationId: string,
) {
  if (points > Math.max(0, balance))
    throw new BusinessError(
      "Not enough loyalty points. Refresh the customer's balance.",
    );
  if (points)
    await tx.loyaltyEntry.create({
      data: {
        branchId,
        customerId,
        saleId,
        points: -points,
        reason: "REDEEM",
        operationId: `loyalty-redeem:${operationId}`,
      },
    });
}
export async function reverseLoyalty(
  tx: Prisma.TransactionClient,
  branchId: string,
  customerId: string,
  saleId: string,
  lines: SaleItem[],
  returned: { line: SaleItem; quantity: number }[],
  operationId: string,
) {
  await lockLoyalty(tx, branchId, customerId);
  const entries = await tx.$queryRaw<
    { points: number; reason: string }[]
  >`SELECT points,reason FROM LoyaltyEntry WHERE saleId=${saleId} AND branchId=${branchId} FOR UPDATE`;
  const earned = entries
      .filter((e) => e.reason === "EARN")
      .reduce((n, e) => n + e.points, 0),
    spent = -entries
      .filter((e) => e.reason === "REDEEM")
      .reduce((n, e) => n + e.points, 0);
  if (!earned && !spent) return;
  const total = lines.reduce(
    (n, l) => n + BigInt(l.unitPricePaise) * BigInt(l.quantity),
    0n,
  );
  const weight = lines.reduce(
    (n, l) =>
      n +
      BigInt(l.unitPricePaise) *
        BigInt(
          l.returnedQuantity +
            (returned.find((r) => r.line.id === l.id)?.quantity ?? 0),
        ),
    0n,
  );
  const target = total
    ? Number((BigInt(spent) * weight) / total) -
      Number((BigInt(earned) * weight) / total)
    : 0;
  const prior = entries
    .filter((e) => e.reason === "RETURN")
    .reduce((n, e) => n + e.points, 0);
  const points = target - prior;
  if (points)
    await tx.loyaltyEntry.create({
      data: {
        branchId,
        customerId,
        saleId,
        points,
        reason: "RETURN",
        operationId: `loyalty-return:${operationId}`,
      },
    });
}
