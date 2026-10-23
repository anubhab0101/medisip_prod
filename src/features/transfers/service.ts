import "server-only";
import { z } from "zod";
import { Prisma, type Batch, type Branch, type Transfer } from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { id, operationId, quantity } from "@/lib/validation";
import { BusinessError } from "@/lib/errors";
import { shopDate } from "@/lib/date";
export const transferItems = z
  .array(
    z.object({
      batchId: id,
      medicineId: id,
      name: z.string(),
      batchNo: z.string(),
      expiryDate: z.string(),
      quantity,
      mrpPaise: z.number().int(),
      purchasePricePaise: z.number().int(),
    }),
  )
  .length(1);
export async function dispatchTransfer(raw: unknown) {
  const ctx = await context(Permission.STOCK_WRITE);
  const input = z
    .object({
      operationId,
      toBranchId: id,
      batchId: id,
      quantity,
      confirmed: z.literal(true),
    })
    .parse(raw);
  if (
    input.toBranchId === ctx.branch.id ||
    !ctx.memberships.some(
      (m) =>
        m.branchId === input.toBranchId &&
        ["OWNER", "PHARMACIST"].includes(m.role),
    )
  )
    throw new BusinessError("Choose another shop you manage.");
  return transaction(async (tx) => {
    const branches = await tx.$queryRaw<Branch[]>(
      Prisma.sql`SELECT * FROM Branch WHERE id IN (${Prisma.join([ctx.branch.id, input.toBranchId].sort())}) ORDER BY id FOR UPDATE`,
    );
    const origin = branches.find((branch) => branch.id === ctx.branch.id);
    const destination = branches.find(
      (branch) => branch.id === input.toBranchId,
    );
    if (
      !origin?.active ||
      !destination?.active ||
      origin.demo !== destination.demo
    )
      throw new BusinessError(
        "Both shops must be active and use the same practice mode.",
      );
    const previous = await tx.transfer.findUnique({
      where: { operationId: input.operationId },
    });
    if (previous) {
      if (previous.fromBranchId !== ctx.branch.id)
        throw new BusinessError("Transfer belongs to another shop.");
      return previous.id;
    }
    const source = await tx.batch.findFirst({
      where: { id: input.batchId, branchId: ctx.branch.id },
      select: { medicineId: true },
    });
    if (!source) throw new BusinessError("Batch not found.");
    await tx.$queryRaw`SELECT id FROM Medicine WHERE id=${source.medicineId} FOR UPDATE`;
    const [batch] = await tx.$queryRaw<
      Batch[]
    >`SELECT * FROM Batch WHERE id=${input.batchId} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (
      !batch ||
      batch.qtyOnHand - batch.qtyReserved < input.quantity ||
      batch.expiryDate.toISOString().slice(0, 10) < shopDate()
    )
      throw new BusinessError("Not enough unexpired, unreserved stock.");
    const medicine = await tx.medicine.findUniqueOrThrow({
      where: { id: batch.medicineId },
    });
    const transfer = await tx.transfer.create({
      data: {
        fromBranchId: ctx.branch.id,
        toBranchId: destination.id,
        operationId: input.operationId,
        userId: ctx.user.id,
        items: [
          {
            batchId: batch.id,
            medicineId: medicine.id,
            name: medicine.name,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate.toISOString(),
            quantity: input.quantity,
            mrpPaise: batch.mrpPaise,
            purchasePricePaise: batch.purchasePricePaise,
          },
        ],
      },
    });
    await tx.batch.update({
      where: { id: batch.id },
      data: { qtyOnHand: { decrement: input.quantity } },
    });
    await tx.stockMovement.create({
      data: {
        branchId: ctx.branch.id,
        batchId: batch.id,
        type: "TRANSFER_OUT",
        quantity: -input.quantity,
        reason: `Transfer to ${destination.name}`,
        refId: transfer.id,
        userId: ctx.user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "DISPATCH_TRANSFER",
        entity: "Transfer",
        entityId: transfer.id,
      },
    });
    return transfer.id;
  });
}
export async function receiveTransfer(raw: unknown) {
  const ctx = await context(Permission.STOCK_WRITE);
  const input = z.object({ id, confirmed: z.literal(true) }).parse(raw);
  return transaction(async (tx) => {
    const [transfer] = await tx.$queryRaw<
      Transfer[]
    >`SELECT * FROM Transfer WHERE id=${input.id} AND toBranchId=${ctx.branch.id} FOR UPDATE`;
    if (!transfer) throw new BusinessError("Incoming transfer not found.");
    if (transfer.status === "RECEIVED") return transfer.id;
    if (transfer.status !== "DISPATCHED")
      throw new BusinessError("Transfer cannot be received.");
    const [item] = transferItems.parse(transfer.items);
    await tx.$queryRaw`SELECT id FROM Medicine WHERE id=${item.medicineId} FOR UPDATE`;
    const expiryDate = new Date(item.expiryDate);
    const [existing] = await tx.$queryRaw<
      Batch[]
    >`SELECT * FROM Batch WHERE branchId=${ctx.branch.id} AND medicineId=${item.medicineId} AND batchNo=${item.batchNo} AND expiryDate=${expiryDate} FOR UPDATE`;
    if (
      existing &&
      (existing.mrpPaise !== item.mrpPaise ||
        existing.purchasePricePaise !== item.purchasePricePaise)
    )
      throw new BusinessError(
        "This shop has different prices for the same batch. Review its batch prices first.",
      );
    await tx.branchMedicine.upsert({
      where: {
        branchId_medicineId: {
          branchId: ctx.branch.id,
          medicineId: item.medicineId,
        },
      },
      create: { branchId: ctx.branch.id, medicineId: item.medicineId },
      update: {},
    });
    const batch = await tx.batch.upsert({
      where: {
        branchId_medicineId_batchNo_expiryDate: {
          branchId: ctx.branch.id,
          medicineId: item.medicineId,
          batchNo: item.batchNo,
          expiryDate,
        },
      },
      create: {
        branchId: ctx.branch.id,
        medicineId: item.medicineId,
        batchNo: item.batchNo,
        expiryDate,
        qtyOnHand: item.quantity,
        mrpPaise: item.mrpPaise,
        purchasePricePaise: item.purchasePricePaise,
      },
      update: { qtyOnHand: { increment: item.quantity } },
    });
    await tx.stockMovement.create({
      data: {
        branchId: ctx.branch.id,
        batchId: batch.id,
        type: "TRANSFER_IN",
        quantity: item.quantity,
        reason: "Received branch transfer",
        refId: transfer.id,
        userId: ctx.user.id,
      },
    });
    await tx.transfer.update({
      where: { id: transfer.id },
      data: {
        status: "RECEIVED",
        receivedAt: new Date(),
        receivedBy: ctx.user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "RECEIVE_TRANSFER",
        entity: "Transfer",
        entityId: transfer.id,
      },
    });
    return transfer.id;
  });
}
