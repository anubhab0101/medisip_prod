import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { PrismaClient, Role } from "@prisma/client";
import type { AppContext } from "../../src/server/context";
import { can, type PermissionName } from "../../src/lib/permissions";
import { BusinessError } from "../../src/lib/errors";
let ctx: AppContext;
vi.mock("@/server/context", () => ({
  context: async (permission: PermissionName) => {
    if (!can(ctx.role, permission))
      throw new BusinessError("Permission denied");
    return ctx;
  },
}));
import { checkout } from "../../src/features/billing/service";
import { returnSale } from "../../src/features/billing/returns";
import {
  createDelivery,
  updateDelivery,
} from "../../src/features/delivery/service";
import {
  prepareOffline,
  closeOffline,
} from "../../src/features/offline/service";
import { dispatchTransfer } from "../../src/features/transfers/service";
import { getReport } from "../../src/features/reports/service";
import { adjustStock } from "../../src/features/stock/service";
import { db } from "../../src/server/db";
const prisma = new PrismaClient();
let medicineId = "",
  batchId = "",
  customerId = "",
  otherBranchId = "";
const operation = () => randomUUID();
function bill(quantity = 1, points = 0) {
  return {
    operationId: operation(),
    customerId,
    loyaltyPoints: points,
    items: [{ medicineId, quantity }],
    payments: [{ method: "CASH", amountPaise: quantity * 1000 - points * 100 }],
  };
}
beforeAll(async () => {
  if (
    !/^\/medishop_restore_\d+$/.test(
      new URL(process.env.DATABASE_URL ?? "").pathname,
    )
  )
    throw new Error("Only isolated restore databases may run this suite.");
  const branch = await prisma.branch.create({
    data: {
      name: "Remaining features test",
      phone: "+919999999993",
      address: "Isolated test",
      drugLicenseNo: "TEST",
      demo: true,
      loyaltyEnabled: true,
      loyaltyEarnPaise: 1000,
      loyaltyRedeemPaise: 100,
    },
  });
  ctx = {
    branch,
    role: Role.OWNER,
    user: {
      id: operation(),
      name: "Test",
      email: "test@example.invalid",
      locale: "en",
    },
    memberships: [],
  };
  const other = await prisma.branch.create({
    data: {
      name: "Other isolated shop",
      address: "Test",
      phone: "+919999999994",
      demo: true,
    },
  });
  otherBranchId = other.id;
  ctx.memberships = [
    {
      userId: ctx.user.id,
      branchId: other.id,
      branch: other,
      role: Role.OWNER,
    },
  ];
  customerId = (
    await prisma.customer.create({
      data: { branchId: branch.id, name: "Test", phone: "+919999999993" },
    })
  ).id;
  medicineId = (
    await prisma.medicine.create({
      data: {
        name: "Isolated medicine",
        branchSettings: { create: { branchId: branch.id } },
      },
    })
  ).id;
  batchId = (
    await prisma.batch.create({
      data: {
        branchId: branch.id,
        medicineId,
        batchNo: "TEST",
        expiryDate: new Date("2099-12-31"),
        qtyOnHand: 100,
        mrpPaise: 1000,
        purchasePricePaise: 500,
      },
    })
  ).id;
});
afterAll(async () => {
  if (ctx) {
    const branchId = ctx.branch.id;
    const saleIds = (
      await prisma.sale.findMany({ where: { branchId }, select: { id: true } })
    ).map((s) => s.id);
    await prisma.delivery.deleteMany({ where: { branchId } });
    const devices = await prisma.device.findMany({
      where: { branchId },
      select: { id: true },
    });
    await prisma.offlineOperation.deleteMany({
      where: { deviceId: { in: devices.map((d) => d.id) } },
    });
    await prisma.stockReservation.deleteMany({ where: { branchId } });
    await prisma.device.deleteMany({ where: { branchId } });
    await prisma.receiptShare.deleteMany({
      where: { saleId: { in: saleIds } },
    });
    await prisma.saleReturn.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.payment.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.loyaltyEntry.deleteMany({ where: { branchId } });
    await prisma.sale.deleteMany({ where: { branchId } });
    await prisma.stockMovement.deleteMany({ where: { branchId } });
    await prisma.auditLog.deleteMany({ where: { branchId } });
    await prisma.invoiceCounter.deleteMany({ where: { branchId } });
    await prisma.purchase.deleteMany({ where: { branchId } });
    await prisma.supplier.deleteMany({ where: { branchId } });
    await prisma.batch.deleteMany({ where: { branchId } });
    await prisma.branchMedicine.deleteMany({ where: { branchId } });
    await prisma.medicine.deleteMany({ where: { id: medicineId } });
    await prisma.customer.deleteMany({ where: { branchId } });
    await prisma.branch.deleteMany({
      where: { id: { in: [branchId, otherBranchId] } },
    });
  }
  await db().$disconnect();
  await prisma.$disconnect();
});
it("serializes concurrent point redemption and conserves points across partial returns", async () => {
  await prisma.loyaltyEntry.create({
    data: {
      branchId: ctx.branch.id,
      customerId,
      points: 5,
      reason: "TEST",
      operationId: operation(),
    },
  });
  const outcomes = await Promise.allSettled([
    checkout(bill(1, 5)),
    checkout(bill(1, 5)),
  ]);
  expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((x) => x.status === "rejected")).toHaveLength(1);
  expect(
    (
      await prisma.loyaltyEntry.aggregate({
        where: { customerId },
        _sum: { points: true },
      })
    )._sum.points,
  ).toBe(0);
  const saleId = await checkout(bill(3));
  const line = await prisma.saleItem.findFirstOrThrow({ where: { saleId } });
  for (let n = 0; n < 3; n++) {
    const request = {
      saleId,
      operationId: operation(),
      reason: "Test return",
      refundMethod: "CASH",
      items: [{ saleItemId: line.id, quantity: 1 }],
    };
    const returned = await returnSale(request);
    expect(await returnSale(request)).toBe(returned);
    expect(
      (
        await prisma.loyaltyEntry.aggregate({
          where: { saleId },
          _sum: { points: true },
        })
      )._sum.points,
    ).toBe(2 - n);
  }
  expect(await prisma.saleReturn.count({ where: { saleId } })).toBe(3);
});
it("prevents delivery step skipping, cross-shop access and advancing returned bills", async () => {
  const saleId = await checkout(bill());
  const input = {
    saleId,
    address: "Test address",
    phone: "+919999999993",
    assignedTo: "",
    notes: "",
  };
  const id = await createDelivery(input);
  expect(await createDelivery(input)).toBe(id);
  const update = { id, assignedTo: "Test courier", notes: "", confirmed: true };
  await expect(
    updateDelivery({ ...update, status: "DELIVERED" }),
  ).rejects.toThrow("steps in order");
  const original = ctx.branch;
  ctx.branch = await prisma.branch.findUniqueOrThrow({
    where: { id: otherBranchId },
  });
  await expect(updateDelivery({ ...update, status: "PACKED" })).rejects.toThrow(
    "not found",
  );
  ctx.branch = original;
  await updateDelivery({ ...update, status: "PACKED" });
  const line = await prisma.saleItem.findFirstOrThrow({ where: { saleId } });
  await returnSale({
    saleId,
    operationId: operation(),
    reason: "Test full return",
    refundMethod: "CASH",
    items: [{ saleItemId: line.id, quantity: 1 }],
  });
  await expect(
    updateDelivery({ ...update, status: "OUT_FOR_DELIVERY" }),
  ).rejects.toThrow("returned or voided");
  await updateDelivery({ ...update, status: "CANCELLED" });
  expect(
    (await prisma.delivery.findUniqueOrThrow({ where: { id } })).status,
  ).toBe("CANCELLED");
});
it("denies doctor financial access and isolates reports by shop and India date boundaries", async () => {
  ctx.role = Role.DOCTOR;
  await expect(getReport({ kind: "sales" })).rejects.toThrow(
    "Permission denied",
  );
  await expect(checkout(bill())).rejects.toThrow("Permission denied");
  ctx.role = Role.OWNER;
  const saleId = await checkout(bill());
  await prisma.sale.update({
    where: { id: saleId },
    data: { createdAt: new Date("2025-01-01T18:30:00Z") },
  });
  const previous = await getReport({
    kind: "sales",
    from: "2025-01-01",
    to: "2025-01-01",
  });
  const day = await getReport({
    kind: "sales",
    from: "2025-01-02",
    to: "2025-01-02",
  });
  expect(previous.rows).toHaveLength(0);
  expect(day.rows).toHaveLength(1);
  const original = ctx.branch;
  ctx.branch = await prisma.branch.findUniqueOrThrow({
    where: { id: otherBranchId },
  });
  expect(
    (await getReport({ kind: "sales", from: "2025-01-02", to: "2025-01-02" }))
      .rows,
  ).toHaveLength(0);
  ctx.branch = original;
});
it("rejects stale active-branch context for offline reservations and transfers", async () => {
  await prisma.branch.update({
    where: { id: ctx.branch.id },
    data: { active: false },
  });
  try {
    await expect(
      prepareOffline({
        deviceId: operation(),
        secret: randomBytes(32).toString("base64url"),
        name: "Test",
        items: [{ batchId, quantity: 1 }],
      }),
    ).rejects.toThrow("no longer active");
    await expect(
      dispatchTransfer({
        operationId: operation(),
        toBranchId: otherBranchId,
        batchId,
        quantity: 1,
        confirmed: true,
      }),
    ).rejects.toThrow("Both shops must be active");
    expect(
      await prisma.device.count({ where: { branchId: ctx.branch.id } }),
    ).toBe(0);
    expect(
      await prisma.transfer.count({ where: { fromBranchId: ctx.branch.id } }),
    ).toBe(0);
  } finally {
    await prisma.branch.update({
      where: { id: ctx.branch.id },
      data: { active: true },
    });
  }
});
it("records expired-stock loss once at immutable write-off cost", async () => {
  const expired = await prisma.batch.create({
    data: {
      branchId: ctx.branch.id,
      medicineId,
      batchNo: "EXPIRED",
      expiryDate: new Date("2020-12-31"),
      qtyOnHand: 10,
      purchasePricePaise: 450,
      mrpPaise: 1000,
    },
  });
  const request = {
    batchId: expired.id,
    quantity: -2,
    type: "EXPIRED",
    reason: "Expired stock removed",
    operationId: operation(),
  };
  const movementId = await adjustStock(request);
  expect(await adjustStock(request)).toBe(movementId);
  await expect(adjustStock({ ...request, quantity: -3 })).rejects.toThrow(
    "different details",
  );
  await expect(
    adjustStock({ ...request, operationId: operation(), batchId }),
  ).rejects.toThrow("already expired");
  await expect(
    adjustStock({ ...request, operationId: operation(), quantity: 1 }),
  ).rejects.toThrow("already expired");
  await prisma.batch.update({
    where: { id: expired.id },
    data: { purchasePricePaise: 999 },
  });
  const report = await getReport({ kind: "expiry-loss" });
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0].slice(2, 5)).toEqual(["EXPIRED", 2, "9.00"]);
  expect(
    (await prisma.batch.findUniqueOrThrow({ where: { id: expired.id } }))
      .qtyOnHand,
  ).toBe(8);
});
it("compares purchases with net sales while recognizing refunds on their own date", async () => {
  const supplier = await prisma.supplier.create({
    data: { branchId: ctx.branch.id, name: "Test" },
  });
  await prisma.purchase.create({
    data: {
      branchId: ctx.branch.id,
      supplierId: supplier.id,
      invoiceNo: "TEST",
      date: new Date("2025-02-01T06:00:00Z"),
      totalPaise: 700,
      userId: ctx.user.id,
      operationId: operation(),
    },
  });
  const saleId = await checkout(bill());
  await prisma.sale.update({
    where: { id: saleId },
    data: { createdAt: new Date("2025-02-01T06:00:00Z") },
  });
  const line = await prisma.saleItem.findFirstOrThrow({ where: { saleId } });
  const returned = await returnSale({
    saleId,
    operationId: operation(),
    reason: "Test refund",
    refundMethod: "CASH",
    items: [{ saleItemId: line.id, quantity: 1 }],
  });
  await prisma.saleReturn.update({
    where: { id: returned },
    data: { createdAt: new Date("2025-02-02T06:00:00Z") },
  });
  const report = await getReport({
    kind: "purchase-sales",
    from: "2025-02-01",
    to: "2025-02-02",
  });
  expect(report.rows).toEqual([
    ["2025-02-01", "7.00", "10.00", "0.00", "10.00"],
    ["2025-02-02", "0.00", "0.00", "10.00", "-10.00"],
  ]);
});
it("syncs discounted offline split payments at reserved prices exactly once", async () => {
  const identity = {
    deviceId: operation(),
    secret: randomBytes(32).toString("base64url"),
  };
  await prepareOffline({
    ...identity,
    name: "Split counter",
    items: [{ batchId, quantity: 3 }],
  });
  await prisma.batch.update({
    where: { id: batchId },
    data: { mrpPaise: 1200 },
  });
  const request = {
    operationId: operation(),
    items: [{ medicineId, batchId, quantity: 2, discountBasisPoints: 1000 }],
    billDiscountPaise: 100,
    payments: [
      { method: "CASH", amountPaise: 700 },
      { method: "UPI", amountPaise: 500, reference: "confirmed-upi" },
      { method: "CARD", amountPaise: 500, reference: "confirmed-terminal" },
    ],
  };
  await expect(
    checkout(
      { ...request, payments: [{ method: "UPI", amountPaise: 1700 }] },
      identity,
    ),
  ).rejects.toThrow("payment reference");
  await expect(
    checkout(
      { ...request, payments: [{ method: "CASH", amountPaise: 1600 }] },
      identity,
    ),
  ).rejects.toThrow("match the bill total");
  const saleId = await checkout(request, identity);
  expect(await checkout(request, identity)).toBe(saleId);
  const saved = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { payments: true },
  });
  expect(saved.totalPaise).toBe(1700);
  expect(saved.discountPaise).toBe(300);
  expect(saved.payments).toHaveLength(3);
  expect(
    (
      await prisma.stockReservation.findFirstOrThrow({
        where: { deviceId: identity.deviceId },
      })
    ).consumed,
  ).toBe(2);
  await expect(
    checkout({ ...request, billDiscountPaise: 200 }, identity),
  ).rejects.toThrow("different contents");
  await closeOffline({ ...identity, confirmed: true });
  expect(
    (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
      .qtyReserved,
  ).toBe(0);
});
