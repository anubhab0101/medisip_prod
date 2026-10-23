import "server-only";
import { z } from "zod";
import { type Sale, type CreditEntry, PaymentMethod } from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { id, operationId, paise } from "@/lib/validation";
export async function receiveCreditPayment(raw: unknown) {
  const ctx = await context(Permission.CUSTOMER);
  const input = z
    .object({
      customerId: id,
      operationId,
      amountPaise: paise.refine((n) => n > 0),
      method: z.enum([
        PaymentMethod.CASH,
        PaymentMethod.UPI,
        PaymentMethod.CARD,
      ]),
    })
    .parse(raw);
  return transaction(async (tx) => {
    const customers = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM Customer WHERE id=${input.customerId} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!customers.length)
      throw new BusinessError("Customer not found in this shop.");
    const previous = await tx.creditEntry.findFirst({
      where: { operationId: { startsWith: `payment:${input.operationId}:` } },
    });
    if (previous) {
      if (previous.branchId !== ctx.branch.id)
        throw new BusinessError("Payment request belongs to another shop.");
      return previous.id;
    }
    const sales = await tx.$queryRaw<
      Sale[]
    >`SELECT * FROM Sale WHERE customerId=${input.customerId} AND branchId=${ctx.branch.id} AND creditPaise>0 ORDER BY id FOR UPDATE`;
    sales.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const entries = await tx.$queryRaw<
      CreditEntry[]
    >`SELECT * FROM CreditEntry WHERE customerId=${input.customerId} AND branchId=${ctx.branch.id} FOR UPDATE`;
    const balance = entries.reduce((n, e) => n + e.amountPaise, 0);
    if (input.amountPaise > balance)
      throw new BusinessError(
        "Payment exceeds the outstanding credit balance.",
      );
    let remaining = input.amountPaise;
    for (const sale of sales) {
      const applied = Math.min(remaining, sale.creditPaise);
      if (!applied) continue;
      await tx.creditEntry.create({
        data: {
          branchId: ctx.branch.id,
          customerId: input.customerId,
          saleId: sale.id,
          amountPaise: -applied,
          reason: "Credit payment received",
          method: input.method,
          operationId: `payment:${input.operationId}:${sale.id}`,
          userId: ctx.user.id,
        },
      });
      await tx.payment.create({
        data: {
          saleId: sale.id,
          method: input.method,
          amountPaise: applied,
          reference: "Credit settlement",
        },
      });
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          creditPaise: { decrement: applied },
          status: applied === sale.creditPaise ? "PAID" : sale.status,
        },
      });
      remaining -= applied;
      if (!remaining) break;
    }
    if (remaining)
      throw new BusinessError(
        "The credit ledger needs owner review before accepting this payment.",
      );
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "CREDIT_PAYMENT",
        entity: "Customer",
        entityId: input.customerId,
        after: { amountPaise: input.amountPaise, method: input.method },
      },
    });
    return input.customerId;
  });
}
