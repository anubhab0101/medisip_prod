import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";
import type { AppContext } from "../../src/server/context";
import { can, type PermissionName } from "../../src/lib/permissions";
let ctx: AppContext;
vi.mock("@/server/context", () => ({
  context: async (permission: PermissionName) => {
    if (!can(ctx.role, permission)) throw new Error("Permission denied");
    return ctx;
  },
}));
import { preparePractice } from "../../src/features/settings/practice-service";
import { db } from "../../src/server/db";
const prisma = new PrismaClient();
let userId = "",
  realId = "",
  practiceId = "";
const branchIds: string[] = [];
const request = (reset = false) => ({
  operationId: randomUUID(),
  confirmed: true,
  reset,
});
beforeAll(async () => {
  if (
    !/^\/medishop_restore_\d+$/.test(
      new URL(process.env.DATABASE_URL ?? "").pathname,
    )
  )
    throw new Error("Requires isolated restore database.");
  const user = await prisma.user.create({
    data: {
      name: "Practice verification",
      email: `${randomUUID()}@example.invalid`,
      passwordHash: "disabled",
    },
  });
  userId = user.id;
  const branch = await prisma.branch.create({
    data: {
      name: "Real verification shop",
      address: "Test",
      phone: "",
      memberships: { create: { userId, role: "OWNER" } },
    },
  });
  realId = branch.id;
  branchIds.push(realId);
  ctx = {
    branch,
    role: Role.OWNER,
    user: { id: userId, name: user.name, email: user.email, locale: "en" },
    memberships: [],
  };
});
afterAll(async () => {
  const owned = await prisma.membership.findMany({
    where: { userId },
    select: { branchId: true },
  });
  branchIds.push(...owned.map((m) => m.branchId));
  const medicines = await prisma.branchMedicine.findMany({
    where: { branchId: { in: branchIds } },
    select: { medicineId: true },
  });
  await prisma.device.deleteMany({
    where: { OR: [{ branchId: { in: branchIds } }, { userId }] },
  });
  await prisma.transfer.deleteMany({
    where: { fromBranchId: { in: branchIds } },
  });
  await prisma.stockMovement.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.batch.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.branchMedicine.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.medicine.deleteMany({
    where: { id: { in: medicines.map((m) => m.medicineId) } },
  });
  await prisma.supplier.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.auditLog.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.membership.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
  await db().$disconnect();
});
it("requires explicit confirmation and fresh owner membership; never resets real shop", async () => {
  await expect(
    preparePractice({ ...request(), confirmed: false }),
  ).rejects.toThrow();
  await expect(preparePractice(request(true))).rejects.toThrow(
    "Only a practice",
  );
  await prisma.membership.update({
    where: { userId_branchId: { userId, branchId: realId } },
    data: { role: "CASHIER" },
  });
  await expect(preparePractice(request())).rejects.toThrow(
    "Only this shop's owner",
  );
  await prisma.membership.update({
    where: { userId_branchId: { userId, branchId: realId } },
    data: { role: "OWNER" },
  });
});
it("creates once under concurrent retries, scopes all sample stock and leaves real shop empty", async () => {
  const input = request();
  const results = await Promise.all([
    preparePractice(input),
    preparePractice(input),
  ]);
  practiceId = results[0];
  branchIds.push(practiceId);
  expect(results[1]).toBe(practiceId);
  expect(
    await prisma.branchMedicine.count({ where: { branchId: practiceId } }),
  ).toBe(3);
  expect(
    await prisma.batch.count({
      where: { branchId: practiceId, qtyOnHand: 20 },
    }),
  ).toBe(3);
  expect(
    await prisma.branchMedicine.count({ where: { branchId: realId } }),
  ).toBe(0);
  expect(await prisma.customer.count({ where: { branchId: practiceId } })).toBe(
    0,
  );
  expect(
    await prisma.auditLog.count({ where: { id: input.operationId } }),
  ).toBe(1);
  ctx.branch = await prisma.branch.findUniqueOrThrow({
    where: { id: practiceId },
  });
});
it("blocks active offline counters and pending transfers", async () => {
  const device = await prisma.device.create({
    data: { branchId: practiceId, userId, name: "Offline", secretHash: "test" },
  });
  await expect(preparePractice(request(true))).rejects.toThrow(
    "offline counter",
  );
  await prisma.device.delete({ where: { id: device.id } });
  const transfer = await prisma.transfer.create({
    data: {
      fromBranchId: practiceId,
      toBranchId: realId,
      items: [],
      userId,
      operationId: randomUUID(),
    },
  });
  await expect(preparePractice(request(true))).rejects.toThrow(
    "pending stock transfers",
  );
  await prisma.transfer.delete({ where: { id: transfer.id } });
});
it("reset archives only practice, preserves prior stock/history, and is retry-safe", async () => {
  const input = request(true);
  const nextId = await preparePractice(input);
  branchIds.push(nextId);
  expect(await preparePractice(input)).toBe(nextId);
  expect(
    (await prisma.branch.findUniqueOrThrow({ where: { id: practiceId } }))
      .active,
  ).toBe(false);
  expect(
    (await prisma.branch.findUniqueOrThrow({ where: { id: realId } })).active,
  ).toBe(true);
  expect(await prisma.batch.count({ where: { branchId: practiceId } })).toBe(3);
  expect(await prisma.batch.count({ where: { branchId: nextId } })).toBe(3);
  await expect(preparePractice(request(true))).rejects.toThrow("archived");
});
