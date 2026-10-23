import "server-only";
import { z } from "zod";
import { type Batch } from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { id, paise } from "@/lib/validation";
import { expiryFromMonth } from "@/lib/date";
import { BusinessError } from "@/lib/errors";
export async function editBatch(raw: unknown) {
  const ctx = await context(Permission.STOCK_WRITE);
  const input = z
    .object({
      id,
      batchNo: z.string().trim().min(1).max(100),
      expiryMonth: z.string(),
      mrpPaise: paise,
      purchasePricePaise: paise,
      reason: z.string().trim().min(3).max(300),
      confirmed: z.literal(true),
    })
    .parse(raw);
  const expiryDate = expiryFromMonth(input.expiryMonth);
  return transaction(async (tx) => {
    const source = await tx.batch.findFirst({
      where: { id: input.id, branchId: ctx.branch.id },
      select: { medicineId: true },
    });
    if (!source) throw new BusinessError("Batch not found.");
    await tx.$queryRaw`SELECT id FROM Medicine WHERE id=${source.medicineId} FOR UPDATE`;
    const [batch] = await tx.$queryRaw<
      Batch[]
    >`SELECT * FROM Batch WHERE id=${input.id} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!batch) throw new BusinessError("Batch not found.");
    if (batch.qtyReserved)
      throw new BusinessError(
        "Reconcile offline stock before editing this batch.",
      );
    const data = {
      batchNo: input.batchNo,
      expiryDate,
      mrpPaise: input.mrpPaise,
      purchasePricePaise: input.purchasePricePaise,
    };
    await tx.batch.update({ where: { id: batch.id }, data });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "EDIT_BATCH",
        entity: "Batch",
        entityId: batch.id,
        before: {
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate.toISOString(),
          mrpPaise: batch.mrpPaise,
          purchasePricePaise: batch.purchasePricePaise,
        },
        after: {
          ...data,
          expiryDate: expiryDate.toISOString(),
          reason: input.reason,
        },
      },
    });
    return batch.id;
  });
}
