import "server-only";
import { Prisma, type PurchaseOrder } from "@prisma/client";
import { z } from "zod";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { id, operationId, quantity } from "@/lib/validation";
import { BusinessError } from "@/lib/errors";
import { shopDate } from "@/lib/date";
export const orderItems = z
  .array(z.object({ medicineId: id, name: z.string(), quantity }))
  .min(1)
  .max(100);
export async function draftOrder(raw: unknown) {
  const ctx = await context(Permission.STOCK_WRITE);
  const input = z.object({ operationId, supplierId: id }).parse(raw);
  return transaction(async (tx) => {
    const previous = await tx.purchaseOrder.findUnique({
      where: { id: input.operationId },
    });
    if (previous) {
      if (previous.branchId !== ctx.branch.id)
        throw new BusinessError("Order belongs to another shop.");
      return previous.id;
    }
    if (
      !(await tx.supplier.findFirst({
        where: { id: input.supplierId, branchId: ctx.branch.id, active: true },
      }))
    )
      throw new BusinessError("Choose an active supplier.");
    const rows = await tx.$queryRaw<
      {
        medicineId: string;
        name: string;
        reorderLevel: number;
        available: Prisma.Decimal;
      }[]
    >(
      Prisma.sql`SELECT m.id AS medicineId,m.name,bm.reorderLevel,COALESCE(SUM(b.qtyOnHand-b.qtyReserved),0) AS available FROM BranchMedicine bm JOIN Medicine m ON m.id=bm.medicineId LEFT JOIN Batch b ON b.medicineId=m.id AND b.branchId=bm.branchId AND b.expiryDate>=${new Date(shopDate())} WHERE bm.branchId=${ctx.branch.id} AND bm.active=1 AND m.active=1 GROUP BY m.id,m.name,bm.reorderLevel HAVING available<=bm.reorderLevel ORDER BY available,m.name LIMIT 100`,
    );
    const items = rows.map((row) => ({
      medicineId: row.medicineId,
      name: row.name,
      quantity: Math.max(1, row.reorderLevel * 2 - Number(row.available)),
    }));
    if (!items.length)
      throw new BusinessError("No medicines currently need restocking.");
    await tx.purchaseOrder.create({
      data: {
        id: input.operationId,
        branchId: ctx.branch.id,
        supplierId: input.supplierId,
        items: orderItems.parse(items),
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "DRAFT_ORDER",
        entity: "PurchaseOrder",
        entityId: input.operationId,
      },
    });
    return input.operationId;
  });
}
export async function updateOrder(raw: unknown) {
  const ctx = await context(Permission.STOCK_WRITE);
  const input = z
    .object({
      id,
      status: z.enum(["ORDERED", "CANCELLED"]),
      items: orderItems.optional(),
      confirmed: z.literal(true),
    })
    .parse(raw);
  return transaction(async (tx) => {
    const [order] = await tx.$queryRaw<
      PurchaseOrder[]
    >`SELECT * FROM PurchaseOrder WHERE id=${input.id} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!order || !["DRAFT", "ORDERED"].includes(order.status))
      throw new BusinessError("This order is no longer editable.");
    if (input.status === "ORDERED" && order.status !== "DRAFT")
      throw new BusinessError("This order was already confirmed.");
    const items = input.items ?? orderItems.parse(order.items);
    const original = orderItems.parse(order.items);
    if (
      items.some((i) => !original.some((o) => o.medicineId === i.medicineId)) ||
      new Set(items.map((i) => i.medicineId)).size !== items.length
    )
      throw new BusinessError("Review the medicines in this order.");
    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: input.status, items },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: input.status,
        entity: "PurchaseOrder",
        entityId: order.id,
      },
    });
  });
}
