import "server-only";
import { z } from "zod";
import { Prisma, type Medicine, type BranchMedicine } from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission, can } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { id } from "@/lib/validation";
import { medicineSchema } from "./schema";

export async function editMedicine(raw: unknown) {
  const ctx = await context(Permission.MEDICINE_WRITE);
  const input = medicineSchema.extend({ id }).parse(raw);
  return transaction(async (tx) => {
    const [before] = await tx.$queryRaw<
      Medicine[]
    >`SELECT * FROM Medicine WHERE id=${input.id} FOR UPDATE`;
    const settings = await tx.$queryRaw<BranchMedicine[]>(
      Prisma.sql`SELECT * FROM BranchMedicine WHERE medicineId=${input.id} FOR UPDATE`,
    );
    if (!before || !settings.some((s) => s.branchId === ctx.branch.id))
      throw new BusinessError("Medicine not found in this shop.");
    if (
      settings.some(
        (s) =>
          !ctx.memberships.some(
            (m) =>
              m.branchId === s.branchId &&
              can(m.role, Permission.MEDICINE_WRITE),
          ),
      )
    ) {
      throw new BusinessError(
        "This medicine is shared. Ask an owner with access to all its shops to edit it.",
      );
    }
    const { id: medicineId, rack, reorderLevel, barcode, ...data } = input;
    await tx.medicine.update({
      where: { id: medicineId },
      data: { ...data, barcode: barcode || null },
    });
    await tx.branchMedicine.update({
      where: { branchId_medicineId: { branchId: ctx.branch.id, medicineId } },
      data: { rack, reorderLevel },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "Medicine",
        entityId: medicineId,
        before: {
          name: before.name,
          gstBasisPoints: before.gstBasisPoints,
          schedule: before.schedule,
        },
        after: input,
      },
    });
    return medicineId;
  });
}

export async function archiveMedicine(raw: unknown) {
  const ctx = await context(Permission.MEDICINE_WRITE);
  const input = z
    .object({ id, active: z.boolean(), confirmed: z.literal(true) })
    .parse(raw);
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Medicine WHERE id=${input.id} FOR UPDATE`;
    const [setting] = await tx.$queryRaw<
      BranchMedicine[]
    >`SELECT * FROM BranchMedicine WHERE medicineId=${input.id} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!setting) throw new BusinessError("Medicine not found in this shop.");
    const reserved = await tx.batch.count({
      where: {
        medicineId: input.id,
        branchId: ctx.branch.id,
        qtyReserved: { gt: 0 },
      },
    });
    if (!input.active && reserved)
      throw new BusinessError(
        "Reconcile the offline counter's reserved stock before archiving.",
      );
    await tx.branchMedicine.update({
      where: {
        branchId_medicineId: { branchId: ctx.branch.id, medicineId: input.id },
      },
      data: { active: input.active },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: input.active ? "RESTORE" : "ARCHIVE",
        entity: "Medicine",
        entityId: input.id,
        after: { active: input.active },
      },
    });
    return input.id;
  });
}
