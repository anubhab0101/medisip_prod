import { reverseLoyalty } from "@/features/loyalty/service";
import "server-only";
import { z } from "zod";
import {
  Prisma,
  type Sale,
  type SaleItem,
  PaymentMethod,
  MovementType,
  SaleStatus,
} from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { id, operationId, quantity } from "@/lib/validation";
import { returnShare } from "./return-pricing";
const schema = z.object({
  saleId: id,
  operationId,
  reason: z.string().trim().min(3).max(300),
  void: z.boolean().default(false),
  refundMethod: z.enum([
    PaymentMethod.CASH,
    PaymentMethod.UPI,
    PaymentMethod.CARD,
  ]),
  items: z
    .array(z.object({ saleItemId: id, quantity }))
    .min(1)
    .max(100),
});
export async function returnSale(raw: unknown) {
  const ctx = await context(Permission.RETURN);
  const input = schema.parse(raw);
  if (new Set(input.items.map((i) => i.saleItemId)).size !== input.items.length)
    throw new BusinessError("Each item may appear only once in a return.");
  return transaction(async (tx) => {
    const [sale] = await tx.$queryRaw<
      Sale[]
    >`SELECT * FROM Sale WHERE id=${input.saleId} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!sale) throw new BusinessError("Bill not found in this shop.");
    const previous = await tx.saleReturn.findUnique({
      where: { operationId: input.operationId },
    });
    if (previous) {
      if (previous.saleId !== sale.id)
        throw new BusinessError("Return request does not match this bill.");
      return previous.id;
    }
    if (sale.status === SaleStatus.VOID || sale.status === SaleStatus.RETURNED)
      throw new BusinessError(
        "This bill has already been fully returned or voided.",
      );
    const lines = await tx.$queryRaw<
      SaleItem[]
    >`SELECT * FROM SaleItem WHERE saleId=${sale.id} ORDER BY id FOR UPDATE`;
    const returned = input.items.map((item) => {
      const line = lines.find((l) => l.id === item.saleItemId);
      if (!line || item.quantity > line.quantity - line.returnedQuantity)
        throw new BusinessError(
          "Return quantity is greater than the quantity remaining on this bill.",
        );
      return {
        line,
        quantity: item.quantity,
        amountPaise: returnShare(
          line.totalPaise,
          line.quantity,
          line.returnedQuantity,
          item.quantity,
        ),
      };
    });
    const complete = lines.every(
      (line) =>
        line.returnedQuantity +
          (returned.find((r) => r.line.id === line.id)?.quantity ?? 0) ===
        line.quantity,
    );
    if (input.void && !complete)
      throw new BusinessError(
        "To void a bill, return all its remaining items.",
      );
    const previousRefund = await tx.saleReturn.aggregate({
      where: { saleId: sale.id },
      _sum: { amountPaise: true },
    });
    const refundable = sale.totalPaise - (previousRefund._sum.amountPaise ?? 0);
    const amountPaise = complete
      ? refundable
      : Math.min(
          refundable,
          returned.reduce((n, r) => n + r.amountPaise, 0),
        );
    if (
      amountPaise < 0 ||
      amountPaise > sale.totalPaise - (previousRefund._sum.amountPaise ?? 0)
    )
      throw new BusinessError(
        "This return needs the owner to review the refund calculation.",
      );
    const creditEntries = await tx.creditEntry.aggregate({
      where: { saleId: sale.id },
      _sum: { amountPaise: true },
    });
    const creditRefundPaise = Math.min(
      amountPaise,
      Math.max(0, creditEntries._sum.amountPaise ?? 0),
    );
    const cashRefundPaise = amountPaise - creditRefundPaise;
    if (sale.customerId)
      await reverseLoyalty(
        tx,
        ctx.branch.id,
        sale.customerId,
        sale.id,
        lines,
        returned,
        input.operationId,
      );
    const batchIds = [...new Set(returned.map((r) => r.line.batchId))].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM Batch WHERE id IN (${Prisma.join(batchIds)}) ORDER BY id FOR UPDATE`,
    );
    const result = await tx.saleReturn.create({
      data: {
        saleId: sale.id,
        userId: ctx.user.id,
        operationId: input.operationId,
        reason: input.reason,
        amountPaise,
        creditRefundPaise,
        cashRefundPaise,
        refundMethod: input.refundMethod,
        items: returned.map((r) => ({
          saleItemId: r.line.id,
          quantity: r.quantity,
          amountPaise: r.amountPaise,
          taxablePaise: returnShare(
            r.line.taxablePaise,
            r.line.quantity,
            r.line.returnedQuantity,
            r.quantity,
          ),
          cgstPaise: returnShare(
            r.line.cgstPaise,
            r.line.quantity,
            r.line.returnedQuantity,
            r.quantity,
          ),
          sgstPaise: returnShare(
            r.line.sgstPaise,
            r.line.quantity,
            r.line.returnedQuantity,
            r.quantity,
          ),
        })),
      },
    });
    for (const entry of returned) {
      await tx.saleItem.update({
        where: { id: entry.line.id },
        data: { returnedQuantity: { increment: entry.quantity } },
      });
      await tx.batch.update({
        where: { id: entry.line.batchId },
        data: { qtyOnHand: { increment: entry.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          branchId: ctx.branch.id,
          batchId: entry.line.batchId,
          type: MovementType.RETURN,
          quantity: entry.quantity,
          userId: ctx.user.id,
          reason: input.reason,
          refId: result.id,
        },
      });
    }
    if (sale.customerId && creditRefundPaise)
      await tx.creditEntry.create({
        data: {
          branchId: ctx.branch.id,
          customerId: sale.customerId,
          saleId: sale.id,
          amountPaise: -creditRefundPaise,
          reason: "Credit reduced by return",
          operationId: `return:${input.operationId}`,
          userId: ctx.user.id,
        },
      });
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: complete
          ? input.void
            ? SaleStatus.VOID
            : SaleStatus.RETURNED
          : sale.status,
        creditPaise: { decrement: creditRefundPaise },
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: input.void ? "VOID" : "RETURN",
        entity: "Sale",
        entityId: sale.id,
        after: {
          returnId: result.id,
          reason: input.reason,
          amountPaise,
          creditRefundPaise,
          cashRefundPaise,
        },
      },
    });
    await tx.receiptShare.updateMany({
      where: { saleId: sale.id, branchId: ctx.branch.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.id;
  });
}
