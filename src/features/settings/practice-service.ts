import "server-only";
import { z } from "zod";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { operationId } from "@/lib/validation";
import { BusinessError } from "@/lib/errors";

/** Creates a separate training branch. Reset archives history; it never deletes it. */
export async function preparePractice(raw: unknown) {
  const ctx = await context(Permission.SETTINGS);
  const input = z
    .object({ operationId, confirmed: z.literal(true), reset: z.boolean() })
    .parse(raw);
  return transaction(async (tx) => {
    const branches = await tx.$queryRaw<
      { id: string; active: number; demo: number }[]
    >`SELECT id,active,demo FROM Branch WHERE id=${ctx.branch.id} FOR UPDATE`;
    const [membership] = await tx.$queryRaw<
      { role: string }[]
    >`SELECT role FROM Membership WHERE userId=${ctx.user.id} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (membership?.role !== "OWNER")
      throw new BusinessError(
        "Only this shop's owner can manage practice data.",
      );
    const [previous] = await tx.$queryRaw<
      { branchId: string; userId: string; action: string; entityId: string }[]
    >`SELECT branchId,userId,action,entityId FROM AuditLog WHERE id=${input.operationId} FOR UPDATE`;
    if (previous) {
      if (
        previous.branchId !== ctx.branch.id ||
        previous.userId !== ctx.user.id ||
        previous.action !== (input.reset ? "RESET_PRACTICE" : "CREATE_PRACTICE")
      )
        throw new BusinessError(
          "This request belongs to a different operation.",
        );
      return previous.entityId;
    }
    const source = branches[0];
    if (!source?.active)
      throw new BusinessError(
        "This shop is archived. Switch to an active shop.",
      );
    if (input.reset && !source.demo)
      throw new BusinessError(
        "Only a practice shop can be reset. Real shop data cannot be reset here.",
      );
    if (!input.reset && source.demo)
      throw new BusinessError("Use Reset practice in this practice shop.");
    if (input.reset) {
      const devices = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM Device WHERE branchId=${ctx.branch.id} AND active=1 FOR UPDATE`;
      const transfers = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM Transfer WHERE (fromBranchId=${ctx.branch.id} OR toBranchId=${ctx.branch.id}) AND status='DISPATCHED' FOR UPDATE`;
      if (devices.length)
        throw new BusinessError(
          "Sync and close every offline counter before resetting practice.",
        );
      if (transfers.length)
        throw new BusinessError(
          "Receive pending stock transfers before resetting practice.",
        );
    }
    const branch = await tx.branch.create({
      data: {
        name: "Practice shop",
        address: "Training only — sample address",
        phone: "",
        drugLicenseNo: "PRACTICE ONLY",
        invoicePrefix: "DEMO",
        demo: true,
        memberships: { create: { userId: ctx.user.id, role: "OWNER" } },
      },
    });
    const expiryDate = new Date(
      Date.UTC(new Date().getUTCFullYear() + 2, 11, 31),
    );
    for (const [index, name] of [
      "[Practice] Sample tablet",
      "[Practice] Sample bandage",
      "[Practice] Sample oral solution",
    ].entries()) {
      const medicine = await tx.medicine.create({
        data: {
          name,
          genericName: "Training item only",
          packSize: "1 unit",
          dosageForm: "other",
          category: "Practice",
          branchSettings: {
            create: { branchId: branch.id, rack: "Practice", reorderLevel: 5 },
          },
        },
      });
      const batch = await tx.batch.create({
        data: {
          branchId: branch.id,
          medicineId: medicine.id,
          batchNo: `DEMO-${index + 1}`,
          expiryDate,
          qtyOnHand: 20,
          purchasePricePaise: 500,
          mrpPaise: 1000,
        },
      });
      await tx.stockMovement.create({
        data: {
          branchId: branch.id,
          batchId: batch.id,
          type: "ADJUST",
          quantity: 20,
          reason: "Explicit practice setup: sample stock",
          userId: ctx.user.id,
          refId: input.operationId,
        },
      });
    }
    await tx.supplier.create({
      data: { branchId: branch.id, name: "[Practice] Sample supplier" },
    });
    if (input.reset)
      await tx.branch.update({
        where: { id: ctx.branch.id },
        data: { active: false },
      });
    await tx.auditLog.create({
      data: {
        id: input.operationId,
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: input.reset ? "RESET_PRACTICE" : "CREATE_PRACTICE",
        entity: "Branch",
        entityId: branch.id,
        after: {
          archivedBranchId: input.reset ? ctx.branch.id : null,
          sampleMedicines: 3,
        },
      },
    });
    return branch.id;
  });
}
