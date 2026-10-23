import { beforeAll, afterAll, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runMaintenance, scanBranch } from "../../src/server/jobs/maintenance";
import { db } from "../../src/server/db";
const prisma = new PrismaClient();
let branchId = "",
  medicineId = "";
const date = "2099-01-15";
beforeAll(async () => {
  if (
    !/^\/medishop_restore_\d+$/.test(
      new URL(process.env.DATABASE_URL ?? "").pathname,
    )
  )
    throw new Error("Requires an isolated restore database.");
  process.env.DAILY_BACKUP_ENABLED = "false";
  branchId = (
    await prisma.branch.create({
      data: {
        name: "Isolated daily check",
        address: "Test",
        phone: "",
        demo: false,
      },
    })
  ).id;
  medicineId = (
    await prisma.medicine.create({
      data: {
        name: "Daily check fixture",
        packSize: "1",
        branchSettings: { create: { branchId, reorderLevel: 5 } },
      },
    })
  ).id;
  for (const [batchNo, expiry, qty, reserved] of [
    ["expired", "2099-01-14", 10, 0],
    ["today", date, 3, 1],
    ["soon", "2099-02-14", 2, 0],
    ["later", "2099-02-15", 1, 0],
  ] as const) {
    await prisma.batch.create({
      data: {
        branchId,
        medicineId,
        batchNo,
        expiryDate: new Date(expiry),
        qtyOnHand: qty,
        qtyReserved: reserved,
        purchasePricePaise: 100,
        mrpPaise: 200,
      },
    });
  }
});
afterAll(async () => {
  if (branchId) {
    await prisma.auditLog.deleteMany({ where: { branchId } });
    await prisma.job.deleteMany({
      where: { key: { endsWith: `:${branchId}` }, type: "DAILY_STOCK_SCAN" },
    });
    await prisma.batch.deleteMany({ where: { branchId } });
    await prisma.branchMedicine.deleteMany({ where: { branchId } });
    await prisma.medicine.delete({ where: { id: medicineId } });
    await prisma.branch.delete({ where: { id: branchId } });
  }
  await db().$disconnect();
  await prisma.$disconnect();
});
it("counts expiry boundaries and excludes expired/reserved units from low stock", async () => {
  expect(await scanBranch(branchId, date)).toEqual({
    date,
    expired: 1,
    expiring: 2,
    lowStock: 1,
  });
});
it("waits until 7 AM India and permits only one concurrent daily scan", async () => {
  await runMaintenance(new Date(`${date}T06:59:59+05:30`));
  expect(await prisma.auditLog.count({ where: { branchId } })).toBe(0);
  const now = new Date(`${date}T07:00:00+05:30`);
  await Promise.all([runMaintenance(now), runMaintenance(now)]);
  await runMaintenance(now);
  expect(
    await prisma.auditLog.count({
      where: { branchId, action: "DAILY_STOCK_SCAN" },
    }),
  ).toBe(1);
  expect(
    (
      await prisma.job.findUniqueOrThrow({
        where: { key: `daily-stock:${date}:${branchId}` },
      })
    ).status,
  ).toBe("DONE");
});
