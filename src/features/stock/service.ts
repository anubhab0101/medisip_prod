import "server-only";
import {
  MovementType,
  Prisma,
  type Batch,
  type PurchaseOrder,
} from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { expiryFromMonth, shopDate } from "@/lib/date";
import { orderItems } from "@/features/orders/service";
import { medicineSchema, purchaseSchema, adjustmentSchema } from "./schema";
export async function addMedicine(raw: unknown) {
  const ctx = await context(Permission.MEDICINE_WRITE);
  const input = medicineSchema.parse(raw);
  const { reorderLevel, rack, barcode, ...data } = input;
  return transaction(async (tx) => {
    const medicine = await tx.medicine.create({
      data: {
        ...data,
        barcode: barcode || null,
        branchSettings: {
          create: { branchId: ctx.branch.id, reorderLevel, rack },
        },
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "Medicine",
        entityId: medicine.id,
        after: input,
      },
    });
    return medicine.id;
  });
}
export async function receivePurchase(raw: unknown) {
  const ctx = await context(Permission.STOCK_WRITE);
  const input = purchaseSchema.parse(raw);
  return transaction(async (tx) => {
    const previous = await tx.purchase.findUnique({
      where: { operationId: input.operationId },
    });
    if (previous) {
      if (previous.branchId !== ctx.branch.id)
        throw new BusinessError("This request belongs to another shop.");
      return previous.id;
    }
    if (input.orderId) {
      const [order] = await tx.$queryRaw<
        PurchaseOrder[]
      >`SELECT * FROM PurchaseOrder WHERE id=${input.orderId} AND branchId=${ctx.branch.id} FOR UPDATE`;
      if (
        !order ||
        order.status !== "ORDERED" ||
        order.supplierId !== input.supplierId
      )
        throw new BusinessError("This order cannot be received.");
      const expected = orderItems.parse(order.items);
      const quantities = new Map<string, number>();
      for (const item of input.items)
        quantities.set(
          item.medicineId,
          (quantities.get(item.medicineId) ?? 0) + item.quantity,
        );
      if (
        quantities.size !== expected.length ||
        expected.some((i) => quantities.get(i.medicineId) !== i.quantity)
      )
        throw new BusinessError(
          "Received quantities must match the confirmed order.",
        );
    }
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, branchId: ctx.branch.id, active: true },
    });
    if (!supplier)
      throw new BusinessError("Choose an active supplier from this shop.");
    const date = new Date(`${input.date}T00:00:00+05:30`);
    if (!Number.isFinite(date.getTime()) || shopDate(date) !== input.date)
      throw new BusinessError("Choose a valid purchase date.");
    const ids = [...new Set(input.items.map((i) => i.medicineId))].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM Medicine WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
    );
    const availableMedicines = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT m.id FROM Medicine m JOIN BranchMedicine bm ON bm.medicineId=m.id WHERE m.id IN (${Prisma.join(ids)}) AND m.active=1 AND bm.branchId=${ctx.branch.id} AND bm.active=1 ORDER BY m.id FOR UPDATE`,
    );
    if (availableMedicines.length !== ids.length)
      throw new BusinessError(
        "One of these medicines is unavailable in this shop.",
      );
    const total = input.items.reduce(
      (sum, item) => sum + BigInt(item.quantity) * BigInt(item.unitCostPaise),
      0n,
    );
    if (total > 2_000_000_000n)
      throw new BusinessError(
        "This purchase exceeds the supported amount. Split it into smaller purchases.",
      );
    const purchase = await tx.purchase.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        supplierId: input.supplierId,
        operationId: input.operationId,
        invoiceNo: input.invoiceNo,
        date,
        totalPaise: Number(total),
      },
    });
    for (const item of input.items) {
      const expiryDate = expiryFromMonth(item.expiryMonth);
      const key = {
        branchId: ctx.branch.id,
        medicineId: item.medicineId,
        batchNo: item.batchNo,
        expiryDate,
      };
      const [existing] = await tx.$queryRaw<
        Batch[]
      >`SELECT * FROM Batch WHERE branchId=${ctx.branch.id} AND medicineId=${item.medicineId} AND batchNo=${item.batchNo} AND expiryDate=${expiryDate} FOR UPDATE`;
      if (
        existing &&
        (existing.mrpPaise !== item.mrpPaise ||
          existing.purchasePricePaise !== item.unitCostPaise)
      )
        throw new BusinessError(
          "This batch already has different prices. Ask the owner to review it.",
        );
      const batch = await tx.batch.upsert({
        where: { branchId_medicineId_batchNo_expiryDate: key },
        create: {
          ...key,
          qtyOnHand: item.quantity,
          mrpPaise: item.mrpPaise,
          purchasePricePaise: item.unitCostPaise,
          supplierId: input.supplierId,
        },
        update: { qtyOnHand: { increment: item.quantity } },
      });
      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          batchId: batch.id,
          quantity: item.quantity,
          unitCostPaise: item.unitCostPaise,
        },
      });
      await tx.stockMovement.create({
        data: {
          branchId: ctx.branch.id,
          batchId: batch.id,
          type: MovementType.PURCHASE,
          quantity: item.quantity,
          reason: `Supplier invoice ${input.invoiceNo}`,
          userId: ctx.user.id,
          refId: purchase.id,
        },
      });
    }
    if (input.orderId)
      await tx.purchaseOrder.update({
        where: { id: input.orderId },
        data: { status: "RECEIVED", purchaseId: purchase.id },
      });
    return purchase.id;
  });
}
export async function adjustStock(raw: unknown) {
  const ctx = await context(Permission.STOCK_WRITE);
  const input = adjustmentSchema.parse(raw);
  return transaction(async (tx) => {
    const [batch] = await tx.$queryRaw<
      Batch[]
    >`SELECT * FROM Batch WHERE id=${input.batchId} AND branchId=${ctx.branch.id} FOR UPDATE`;
    const previous = await tx.stockMovement.findFirst({
      where: {
        branchId: ctx.branch.id,
        refId: input.operationId,
        type: { in: [MovementType.ADJUST, MovementType.EXPIRED] },
      },
    });
    if (previous) {
      if (
        previous.batchId !== input.batchId ||
        previous.quantity !== input.quantity ||
        previous.type !== input.type ||
        previous.reason !== input.reason
      )
        throw new BusinessError(
          "This adjustment request was already used with different details.",
        );
      return previous.id;
    }
    if (!batch) throw new BusinessError("Batch not found in this shop.");
    if (
      input.type === "EXPIRED" &&
      (input.quantity >= 0 ||
        batch.expiryDate.toISOString().slice(0, 10) >= shopDate())
    )
      throw new BusinessError(
        "Expiry write-offs can only remove already expired stock.",
      );
    const next = batch.qtyOnHand + input.quantity;
    if (next < batch.qtyReserved)
      throw new BusinessError(
        "This would remove stock reserved for an offline counter. Reconcile that counter first.",
      );
    await tx.batch.update({
      where: { id: batch.id },
      data: { qtyOnHand: next },
    });
    const movement = await tx.stockMovement.create({
      data: {
        branchId: ctx.branch.id,
        batchId: batch.id,
        type: input.type,
        quantity: input.quantity,
        reason: input.reason,
        userId: ctx.user.id,
        refId: input.operationId,
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "ADJUST",
        entity: "Batch",
        entityId: batch.id,
        before: { qtyOnHand: batch.qtyOnHand },
        after: {
          qtyOnHand: next,
          reason: input.reason,
          movementId: movement.id,
          unitCostPaise: batch.purchasePricePaise,
          type: input.type,
        },
      },
    });
    return movement.id;
  });
}
