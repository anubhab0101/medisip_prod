import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  Prisma,
  type Batch,
  type Device,
  type StockReservation,
} from "@prisma/client";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { id, operationId, quantity } from "@/lib/validation";
import { BusinessError } from "@/lib/errors";
import { shopDate } from "@/lib/date";
export const offlineIdentity = z.object({
  deviceId: operationId,
  secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const secretHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function checkDeviceSecret(device: Device, secret: string) {
  const hash = secretHash(secret);
  if (!timingSafeEqual(Buffer.from(device.secretHash), Buffer.from(hash)))
    throw new BusinessError("This offline counter key does not match.");
}
export async function prepareOffline(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const input = offlineIdentity
    .extend({
      name: z.string().trim().min(1).max(100),
      items: z
        .array(z.object({ batchId: id, quantity }))
        .min(1)
        .max(20),
    })
    .parse(raw);
  if (new Set(input.items.map((i) => i.batchId)).size !== input.items.length)
    throw new BusinessError("Choose each batch only once.");
  if (!ctx.branch.address || !ctx.branch.drugLicenseNo)
    throw new BusinessError(
      "Complete shop details before preparing an offline counter.",
    );
  await transaction(async (tx) => {
    const [branch] = await tx.$queryRaw<
      { active: boolean }[]
    >`SELECT active FROM Branch WHERE id=${ctx.branch.id} FOR UPDATE`;
    if (!branch?.active)
      throw new BusinessError("This shop is no longer active.");
    const previous = await tx.device.findUnique({
      where: { id: input.deviceId },
    });
    if (previous) {
      if (
        previous.branchId !== ctx.branch.id ||
        previous.userId !== ctx.user.id ||
        !previous.active
      )
        throw new BusinessError("Counter is unavailable.");
      checkDeviceSecret(previous, input.secret);
      return;
    }
    const batchIds = input.items.map((i) => i.batchId).sort();
    const rows = await tx.batch.findMany({
      where: { id: { in: batchIds }, branchId: ctx.branch.id },
      select: { medicineId: true },
    });
    if (rows.length !== batchIds.length)
      throw new BusinessError("Choose batches from this shop.");
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM Medicine WHERE id IN (${Prisma.join([...new Set(rows.map((r) => r.medicineId))].sort())}) ORDER BY id FOR UPDATE`,
    );
    const batches = await tx.$queryRaw<Batch[]>(
      Prisma.sql`SELECT * FROM Batch WHERE id IN (${Prisma.join(batchIds)}) AND branchId=${ctx.branch.id} ORDER BY id FOR UPDATE`,
    );
    const medicines = await tx.medicine.findMany({
      where: {
        id: { in: rows.map((r) => r.medicineId) },
        active: true,
        schedule: "NONE",
        branchSettings: { some: { branchId: ctx.branch.id, active: true } },
      },
    });
    await tx.device.create({
      data: {
        id: input.deviceId,
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        name: input.name,
        secretHash: secretHash(input.secret),
      },
    });
    for (const i of input.items) {
      const b = batches.find((b) => b.id === i.batchId),
        m = medicines.find((m) => m.id === b?.medicineId);
      if (
        !b ||
        !m ||
        b.expiryDate.toISOString().slice(0, 10) < shopDate() ||
        b.qtyOnHand - b.qtyReserved < i.quantity
      )
        throw new BusinessError(
          "Only available, non-prescription, unexpired stock can be reserved offline.",
        );
      await tx.stockReservation.create({
        data: {
          branchId: ctx.branch.id,
          deviceId: input.deviceId,
          batchId: b.id,
          quantity: i.quantity,
          unitPricePaise: b.mrpPaise,
          gstBasisPoints: m.gstBasisPoints,
        },
      });
      await tx.batch.update({
        where: { id: b.id },
        data: { qtyReserved: { increment: i.quantity } },
      });
    }
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "RESERVE_OFFLINE",
        entity: "Device",
        entityId: input.deviceId,
        after: { items: input.items },
      },
    });
  });
  const reservations = await db().stockReservation.findMany({
    where: { deviceId: input.deviceId, branchId: ctx.branch.id },
  });
  const batches = await db().batch.findMany({
    where: {
      id: { in: reservations.map((r) => r.batchId) },
      branchId: ctx.branch.id,
    },
    include: { medicine: true },
  });
  return {
    deviceId: input.deviceId,
    secret: input.secret,
    branchId: ctx.branch.id,
    userId: ctx.user.id,
    name: input.name,
    day: shopDate(),
    shop: {
      name: ctx.branch.name,
      address: ctx.branch.address,
      phone: ctx.branch.phone,
      drugLicenseNo: ctx.branch.drugLicenseNo,
      practice: ctx.branch.demo,
    },
    items: reservations.map((r) => {
      const b = batches.find((b) => b.id === r.batchId)!;
      return {
        reservationId: r.id,
        batchId: b.id,
        medicineId: b.medicineId,
        name: b.medicine.name,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate.toISOString().slice(0, 10),
        available: r.quantity - r.consumed - r.released,
        unitPricePaise: r.unitPricePaise,
        gstBasisPoints: r.gstBasisPoints,
      };
    }),
  };
}
export async function closeOffline(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const input = offlineIdentity
    .extend({ confirmed: z.literal(true) })
    .parse(raw);
  return transaction(async (tx) => {
    const [device] = await tx.$queryRaw<
      Device[]
    >`SELECT * FROM Device WHERE id=${input.deviceId} AND branchId=${ctx.branch.id} AND userId=${ctx.user.id} FOR UPDATE`;
    if (!device) throw new BusinessError("Counter not found.");
    checkDeviceSecret(device, input.secret);
    if (!device.active) return;
    const reservations = await tx.$queryRaw<
      StockReservation[]
    >`SELECT * FROM StockReservation WHERE deviceId=${device.id} ORDER BY batchId FOR UPDATE`;
    const ids = reservations.map((r) => r.batchId).sort();
    if (ids.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM Batch WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
      );
    for (const r of reservations) {
      const remaining = r.quantity - r.consumed - r.released;
      if (remaining) {
        await tx.batch.update({
          where: { id: r.batchId },
          data: { qtyReserved: { decrement: remaining } },
        });
        await tx.stockReservation.update({
          where: { id: r.id },
          data: { released: { increment: remaining } },
        });
      }
    }
    await tx.device.update({
      where: { id: device.id },
      data: { active: false },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "CLOSE_OFFLINE",
        entity: "Device",
        entityId: device.id,
      },
    });
  });
}
