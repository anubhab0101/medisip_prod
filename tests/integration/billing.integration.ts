import { randomBytes } from "node:crypto";
import {
  prepareOffline,
  closeOffline,
} from "../../src/features/offline/service";
import { editBatch } from "../../src/features/stock/batch-service";
import { editDoctor } from "../../src/features/appointments/edit-service";
import {
  dispatchTransfer,
  receiveTransfer,
} from "../../src/features/transfers/service";
import {
  draftOrder,
  updateOrder,
  orderItems,
} from "../../src/features/orders/service";
import { getReport } from "../../src/features/reports/service";
import {
  scheduleReminder,
  cancelReminder,
} from "../../src/features/notifications/reminder-service";
import { archiveMedicine, editMedicine } from "../../src/features/stock/edit";
import {
  holdBill,
  readHeldBill,
} from "../../src/features/billing/held-service";
import { importMedicines } from "../../src/features/stock/import-service";
import {
  createDelivery,
  updateDelivery,
} from "../../src/features/delivery/service";
import { findSubstitutes } from "../../src/features/stock/substitutes";
import { returnSale } from "../../src/features/billing/returns";
import { receiveCreditPayment } from "../../src/features/customers/credit";
import {
  createDoctor,
  bookAppointment,
} from "../../src/features/appointments/service";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";
import { can, type PermissionName } from "../../src/lib/permissions";
import { BusinessError } from "../../src/lib/errors";
import type { AppContext } from "../../src/server/context";
let ctx: AppContext;
vi.mock("@/server/context", () => ({
  context: async (permission: PermissionName) => {
    if (!can(ctx.role, permission))
      throw new BusinessError("Permission denied");
    return ctx;
  },
}));
import { checkout } from "../../src/features/billing/service";
import {
  addMedicine,
  receivePurchase,
  adjustStock,
} from "../../src/features/stock/service";
import { db } from "../../src/server/db";
const prisma = new PrismaClient();
let supplierId: string;
let medicineId: string;
let batchId: string;
const unique = randomUUID();
function request(quantity = 1) {
  return {
    operationId: randomUUID(),
    items: [{ medicineId, quantity }],
    payments: [{ method: "CASH", amountPaise: quantity * 1000 }],
  };
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!url.pathname.startsWith("/medishop_dev"))
    throw new Error(
      "Integration tests require the isolated medishop_dev database.",
    );
  const branch = await prisma.branch.create({
    data: {
      name: `Integration ${unique}`,
      address: "Isolated automated test shop",
      phone: "9999999999",
      drugLicenseNo: "TEST-NOT-A-LICENCE",
      demo: true,
    },
  });
  ctx = {
    branch,
    role: Role.OWNER,
    user: {
      id: `test-${unique}`,
      name: "Test owner",
      email: "test@medishop.invalid",
      locale: "en",
    },
    memberships: [
      {
        userId: `test-${unique}`,
        branchId: branch.id,
        role: Role.OWNER,
        branch,
      },
    ],
  };
  supplierId = (
    await prisma.supplier.create({
      data: { branchId: branch.id, name: "Test supplier" },
    })
  ).id;
  medicineId = await addMedicine({
    name: `Test medicine ${unique}`,
    gstBasisPoints: 0,
    packSize: "1",
    schedule: "NONE",
    reorderLevel: 1,
  });
  await receivePurchase({
    operationId: randomUUID(),
    supplierId,
    invoiceNo: "OPEN",
    date: "2026-10-08",
    items: [
      {
        medicineId,
        batchNo: "TEST",
        expiryMonth: "2099-12",
        quantity: 5,
        unitCostPaise: 500,
        mrpPaise: 1000,
      },
    ],
  });
  batchId = (
    await prisma.batch.findFirstOrThrow({
      where: { branchId: branch.id, medicineId },
    })
  ).id;
});
afterAll(async () => {
  if (ctx)
    await prisma.branch.update({
      where: { id: ctx.branch.id },
      data: { active: false },
    });
  await db().$disconnect();
  await prisma.$disconnect();
});
describe("actual TiDB pharmacy transactions", () => {
  it("creates stock only with matching movements", async () => {
    expect(
      (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
        .qtyOnHand,
    ).toBe(5);
    expect(
      (
        await prisma.stockMovement.aggregate({
          where: { batchId },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(5);
  });
  it("saves a sale once when the request is retried", async () => {
    const input = request();
    const id = await checkout(input);
    expect(await checkout(input)).toBe(id);
    expect(
      (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
        .qtyOnHand,
    ).toBe(4);
    expect(
      await prisma.sale.count({ where: { branchId: ctx.branch.id } }),
    ).toBe(1);
  });
  it("rolls back invalid payment without consuming invoice or stock", async () => {
    const input = request();
    input.payments[0].amountPaise = 1;
    await expect(checkout(input)).rejects.toThrow("Payment amounts");
    expect(
      (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
        .qtyOnHand,
    ).toBe(4);
    expect(
      (
        await prisma.invoiceCounter.findFirstOrThrow({
          where: { branchId: ctx.branch.id },
        })
      ).nextNumber,
    ).toBe(2);
  });
  it("does not sell expired batches", async () => {
    await prisma.batch.update({
      where: { id: batchId },
      data: { expiryDate: new Date("2020-01-31") },
    });
    await expect(checkout(request())).rejects.toThrow("unexpired stock");
    await prisma.batch.update({
      where: { id: batchId },
      data: { expiryDate: new Date("2099-12-31") },
    });
  });
  it("requires prescription details for controlled schedules", async () => {
    await prisma.medicine.update({
      where: { id: medicineId },
      data: { schedule: "H" },
    });
    await expect(checkout(request())).rejects.toThrow("prescription");
    await prisma.medicine.update({
      where: { id: medicineId },
      data: { schedule: "NONE" },
    });
  });
  it("prevents cashier stock changes", async () => {
    ctx.role = Role.CASHIER;
    await expect(
      adjustStock({
        operationId: randomUUID(),
        batchId,
        quantity: -1,
        reason: "test",
      }),
    ).rejects.toThrow("Permission");
    ctx.role = Role.OWNER;
  });
  it("prevents cross-branch batch adjustment", async () => {
    await expect(
      adjustStock({
        operationId: randomUUID(),
        batchId: "foreign-batch",
        quantity: -1,
        reason: "test",
      }),
    ).rejects.toThrow("not found");
  });
  it("exactly one concurrent checkout wins the last unit", async () => {
    await adjustStock({
      operationId: randomUUID(),
      batchId,
      quantity: -3,
      reason: "Set up last-unit test",
    });
    const results = await Promise.allSettled([
      checkout(request()),
      checkout(request()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
        .qtyOnHand,
    ).toBe(0);
    expect(
      (
        await prisma.stockMovement.aggregate({
          where: { batchId },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(0);
    expect(
      (
        await prisma.invoiceCounter.findFirstOrThrow({
          where: { branchId: ctx.branch.id },
        })
      ).nextNumber,
    ).toBe(3);
  });
  it("concurrent returns cannot refund the same unit twice", async () => {
    const sale = await prisma.sale.findFirstOrThrow({
      where: { branchId: ctx.branch.id },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });
    const input = {
      saleId: sale.id,
      operationId: randomUUID(),
      reason: "Integration return",
      refundMethod: "CASH",
      items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
    };
    const results = await Promise.allSettled([
      returnSale(input),
      returnSale({ ...input, operationId: randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status,
    ).toBe("RETURNED");
    expect(
      (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
        .qtyOnHand,
    ).toBe(1);
  });
  it("credit repayment and return reconcile cash versus remaining credit", async () => {
    await adjustStock({
      operationId: randomUUID(),
      batchId,
      quantity: 3,
      reason: "Credit test stock",
    });
    const customer = await prisma.customer.create({
      data: {
        branchId: ctx.branch.id,
        name: "Credit test",
        phone: "+919999999999",
      },
    });
    const saleId = await checkout({
      ...request(2),
      customerId: customer.id,
      payments: [{ method: "CREDIT", amountPaise: 2000 }],
    });
    await receiveCreditPayment({
      customerId: customer.id,
      operationId: randomUUID(),
      amountPaise: 1000,
      method: "CASH",
    });
    const line = await prisma.saleItem.findFirstOrThrow({ where: { saleId } });
    const returned = await returnSale({
      saleId,
      operationId: randomUUID(),
      reason: "Return credit sale",
      refundMethod: "CASH",
      items: [{ saleItemId: line.id, quantity: 2 }],
    });
    const refund = await prisma.saleReturn.findUniqueOrThrow({
      where: { id: returned },
    });
    expect(refund.creditRefundPaise).toBe(1000);
    expect(refund.cashRefundPaise).toBe(1000);
    expect(
      (
        await prisma.creditEntry.aggregate({
          where: { customerId: customer.id },
          _sum: { amountPaise: true },
        })
      )._sum.amountPaise,
    ).toBe(0);
  });
  it("concurrent appointment requests allow only one booking", async () => {
    const date = new Date("2099-01-05T03:30:00Z");
    const doctorId = await createDoctor({
      name: "Integration doctor",
      specialization: "General",
      feePaise: 0,
      slotMinutes: 15,
      weekday: date.getUTCDay(),
      startMinute: 540,
      endMinute: 600,
    });
    const customer = await prisma.customer.findFirstOrThrow({
      where: { branchId: ctx.branch.id },
    });
    const input = {
      doctorId,
      customerId: customer.id,
      startsAt: date.toISOString(),
      notes: "Integration",
    };
    const results = await Promise.allSettled([
      bookAppointment({ ...input, operationId: randomUUID() }),
      bookAppointment({ ...input, operationId: randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.appointment.count({ where: { doctorId } })).toBe(1);
  });
});

it("archives only this shop and rejects new sales while preserving stock history", async () => {
  const before = await prisma.batch.findUniqueOrThrow({
    where: { id: batchId },
  });
  await archiveMedicine({ id: medicineId, active: false, confirmed: true });
  await expect(checkout(request())).rejects.toThrow("no longer available");
  expect(
    (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
      .qtyOnHand,
  ).toBe(before.qtyOnHand);
  expect(
    await prisma.stockMovement.count({ where: { batchId } }),
  ).toBeGreaterThan(0);
  await archiveMedicine({ id: medicineId, active: true, confirmed: true });
});
it("edits medicine details without rewriting invoice snapshots", async () => {
  const original = await prisma.medicine.findUniqueOrThrow({
    where: { id: medicineId },
  });
  const saleItem = await prisma.saleItem.findFirstOrThrow({
    where: { medicineId },
  });
  await editMedicine({
    ...original,
    barcode: original.barcode ?? "",
    name: "Renamed test medicine",
    reorderLevel: 8,
    rack: "A1",
  });
  expect(
    (await prisma.medicine.findUniqueOrThrow({ where: { id: medicineId } }))
      .name,
  ).toBe("Renamed test medicine");
  expect(
    (await prisma.saleItem.findUniqueOrThrow({ where: { id: saleItem.id } }))
      .name,
  ).toBe(saleItem.name);
});
it("holds a private draft without reserving stock and clears it after one checkout", async () => {
  await adjustStock({
    batchId,
    quantity: 2,
    reason: "Held bill test stock",
    operationId: randomUUID(),
  });
  const before = await prisma.batch.findUniqueOrThrow({
    where: { id: batchId },
  });
  const operationId = randomUUID();
  const draft = {
    version: 2,
    operationId,
    cart: [
      {
        medicine: { id: medicineId },
        quantity: 1,
        discountBasisPoints: 0,
        batchId: "",
      },
    ],
    doctorName: "Test doctor",
    prescriptionRef: "Draft reference",
  };
  const heldId = await holdBill({ label: "Test held customer", draft });
  expect((await readHeldBill(heldId)).prescriptionRef).toBe("Draft reference");
  expect(
    (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
      .qtyOnHand,
  ).toBe(before.qtyOnHand);
  const owner = ctx.user.id;
  ctx.user.id = "other-user";
  try {
    await expect(readHeldBill(heldId)).rejects.toThrow("not found");
  } finally {
    ctx.user.id = owner;
  }
  const input = { ...request(), operationId };
  const saleId = await checkout(input);
  expect(await checkout(input)).toBe(saleId);
  expect(await prisma.heldBill.count({ where: { id: heldId } })).toBe(0);
  expect(
    (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
      .qtyOnHand,
  ).toBe(before.qtyOnHand - 1);
});
it("imports a catalogue atomically and idempotently without adding stock", async () => {
  const row = {
    name: `Imported ${unique}`,
    gstBasisPoints: 500,
    packSize: "1 strip",
    schedule: "NONE",
    reorderLevel: 10,
  };
  const input = { operationId: randomUUID(), rows: [row], confirmed: true };
  const result = await importMedicines(input);
  expect(await importMedicines(input)).toBe(result);
  expect(await prisma.medicine.count({ where: { name: row.name } })).toBe(1);
  await expect(
    importMedicines({
      ...input,
      operationId: randomUUID(),
      rows: [row, { ...row, name: `Must roll back ${unique}` }],
    }),
  ).rejects.toThrow("Duplicate medicine");
  expect(
    await prisma.medicine.count({
      where: { name: `Must roll back ${unique}` },
    }),
  ).toBe(0);
});
it("tracks delivery steps and prevents jumping to completion", async () => {
  const sale = await prisma.sale.findFirstOrThrow({
    where: { branchId: ctx.branch.id, status: "PAID" },
    orderBy: { createdAt: "desc" },
  });
  const deliveryId = await createDelivery({
    saleId: sale.id,
    address: "Test-only address",
    phone: "9999999999",
    assignedTo: "Test courier",
    notes: "",
  });
  const base = {
    id: deliveryId,
    assignedTo: "Test courier",
    notes: "",
    confirmed: true,
  };
  await expect(
    updateDelivery({ ...base, status: "DELIVERED" }),
  ).rejects.toThrow("in order");
  for (const status of ["PACKED", "OUT_FOR_DELIVERY", "DELIVERED"])
    await updateDelivery({ ...base, status });
  await expect(updateDelivery({ ...base, status: "PENDING" })).rejects.toThrow(
    "cannot be reopened",
  );
});
it("matches alternatives only with the same ingredient strength form and pack", async () => {
  const base = {
    genericName: "Fictional ingredient",
    strength: "100 mg",
    dosageForm: "tablet",
    packSize: "10 tablets",
    schedule: "NONE",
    gstBasisPoints: 0,
    reorderLevel: 1,
  };
  const source = await addMedicine({ ...base, name: `Original ${unique}` });
  const alternate = await addMedicine({
    ...base,
    name: `Alternative ${unique}`,
  });
  const wrong = await addMedicine({
    ...base,
    strength: "200 mg",
    name: `Wrong strength ${unique}`,
  });
  await receivePurchase({
    operationId: randomUUID(),
    supplierId,
    invoiceNo: `ALT-${unique}`,
    date: "2026-10-08",
    items: [alternate, wrong].map((medicineId) => ({
      medicineId,
      batchNo: "ALT",
      expiryMonth: "2099-12",
      quantity: 5,
      unitCostPaise: 500,
      mrpPaise: 1000,
    })),
  });
  expect((await findSubstitutes(source)).matches.map((m) => m.id)).toEqual([
    alternate,
  ]);
});

it("schedules credit reminders once, checks consent and supports cancellation", async () => {
  const customer = await prisma.customer.create({
    data: {
      branchId: ctx.branch.id,
      name: "Reminder test",
      phone: `+91${Date.now().toString().slice(-10)}`,
      consentSms: false,
    },
  });
  const input = {
    operationId: randomUUID(),
    customerId: customer.id,
    medicineId: "",
    kind: "CREDIT",
    when: new Date(Date.now() + 86400000).toISOString(),
  };
  await expect(scheduleReminder(input)).rejects.toThrow("agreed");
  await prisma.customer.update({
    where: { id: customer.id },
    data: { consentSms: true },
  });
  await expect(scheduleReminder(input)).rejects.toThrow(
    "no outstanding credit",
  );
  await prisma.creditEntry.create({
    data: {
      branchId: ctx.branch.id,
      customerId: customer.id,
      amountPaise: 1000,
      reason: "Test balance",
      operationId: randomUUID(),
      userId: ctx.user.id,
    },
  });
  const jobId = await scheduleReminder(input);
  expect(await scheduleReminder(input)).toBe(jobId);
  await cancelReminder(jobId);
  expect(
    (await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).lastError,
  ).toBe("Cancelled by staff.");
  await expect(cancelReminder(jobId)).rejects.toThrow("Only pending");
});

it("receives an approved suggested purchase order exactly once", async () => {
  const medicine = await addMedicine({
    name: `Order test ${unique}`,
    gstBasisPoints: 0,
    packSize: "1",
    schedule: "NONE",
    reorderLevel: 5,
  });
  const id = await draftOrder({ operationId: randomUUID(), supplierId });
  const order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
  const items = orderItems.parse(order.items);
  expect(items.find((i) => i.medicineId === medicine)?.quantity).toBe(10);
  await updateOrder({ id, status: "ORDERED", items, confirmed: true });
  const input = {
    operationId: randomUUID(),
    orderId: id,
    supplierId,
    invoiceNo: `PO-${id}`,
    date: "2026-10-08",
    items: items.map((i) => ({
      ...i,
      batchNo: `PO-${id.slice(0, 8)}`,
      expiryMonth: "2099-12",
      unitCostPaise: 500,
      mrpPaise: 1000,
    })),
  };
  await expect(
    receivePurchase({
      ...input,
      items: input.items.map((i, index) =>
        index ? i : { ...i, quantity: i.quantity + 1 },
      ),
    }),
  ).rejects.toThrow("must match");
  const purchase = await receivePurchase(input);
  expect(await receivePurchase(input)).toBe(purchase);
  expect(
    (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })).status,
  ).toBe("RECEIVED");
  await expect(
    receivePurchase({ ...input, operationId: randomUUID() }),
  ).rejects.toThrow("cannot be received");
});
it("reports reconcile sale and return dates and protect report access", async () => {
  const report = await getReport({
    kind: "sales",
    from: "2026-10-08",
    to: "2026-10-08",
  });
  const sales = await prisma.sale.aggregate({
    where: { branchId: ctx.branch.id },
    _sum: { totalPaise: true },
  });
  const returns = await prisma.saleReturn.aggregate({
    where: { sale: { branchId: ctx.branch.id } },
    _sum: { amountPaise: true },
  });
  expect(
    Math.round(report.rows.reduce((n, r) => n + Number(r[3]), 0) * 100),
  ).toBe((sales._sum.totalPaise ?? 0) - (returns._sum.amountPaise ?? 0));
  const gst = await getReport({ kind: "gst", from: "2026-10-08" });
  expect(gst.rows.length).toBeGreaterThan(0);
  const role = ctx.role;
  ctx.role = Role.CASHIER;
  try {
    await expect(getReport({ kind: "credit" })).rejects.toThrow(
      "Permission denied",
    );
  } finally {
    ctx.role = role;
  }
});

it("transfers stock between authorized shops with exactly-once receipt", async () => {
  const original = ctx;
  const destination = await prisma.branch.create({
    data: {
      name: `Transfer destination ${unique}`,
      address: "Test",
      phone: "9999999999",
      drugLicenseNo: "TEST",
      demo: true,
    },
  });
  try {
    const batch = await prisma.batch.findUniqueOrThrow({
      where: { id: batchId },
    });
    const input = {
      operationId: randomUUID(),
      toBranchId: destination.id,
      batchId,
      quantity: 1,
      confirmed: true,
    };
    await expect(dispatchTransfer(input)).rejects.toThrow(
      "another shop you manage",
    );
    ctx = {
      ...ctx,
      memberships: [
        ...ctx.memberships,
        {
          userId: ctx.user.id,
          branchId: destination.id,
          role: Role.OWNER,
          branch: destination,
        },
      ],
    };
    const id = await dispatchTransfer(input);
    expect(await dispatchTransfer(input)).toBe(id);
    expect(
      (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
        .qtyOnHand,
    ).toBe(batch.qtyOnHand - 1);
    await expect(receiveTransfer({ id, confirmed: true })).rejects.toThrow(
      "Incoming transfer not found",
    );
    ctx = { ...ctx, branch: destination };
    await receiveTransfer({ id, confirmed: true });
    await receiveTransfer({ id, confirmed: true });
    expect(
      (
        await prisma.batch.findFirstOrThrow({
          where: { branchId: destination.id, medicineId },
        })
      ).qtyOnHand,
    ).toBe(1);
    expect(
      await prisma.stockMovement.count({
        where: { branchId: destination.id, refId: id },
      }),
    ).toBe(1);
  } finally {
    ctx = original;
    await prisma.branch.update({
      where: { id: destination.id },
      data: { active: false },
    });
  }
});

it("protects existing bookings when doctor hours change", async () => {
  const doctorId = await createDoctor({
    name: "Hours test",
    specialization: "General",
    feePaise: 1000,
    slotMinutes: 15,
    weekday: 1,
    startMinute: 540,
    endMinute: 780,
  });
  const customer = await prisma.customer.create({
    data: {
      branchId: ctx.branch.id,
      name: "Hours customer",
      phone: `+92${Date.now().toString().slice(-10)}`,
    },
  });
  await bookAppointment({
    doctorId,
    customerId: customer.id,
    operationId: randomUUID(),
    startsAt: "2030-01-07T03:30:00.000Z",
  });
  const input = {
    id: doctorId,
    name: "Hours test",
    specialization: "General",
    feePaise: 1200,
    slotMinutes: 15,
    active: true,
    userId: "",
    windows: [
      { weekday: 1, startMinute: 540, endMinute: 780 },
      { weekday: 2, startMinute: 600, endMinute: 720 },
    ],
  };
  await editDoctor(input);
  await expect(
    editDoctor({
      ...input,
      windows: [{ weekday: 1, startMinute: 600, endMinute: 780 }],
    }),
  ).rejects.toThrow("Existing future appointments");
  await expect(
    editDoctor({
      ...input,
      windows: [
        ...input.windows,
        { weekday: 1, startMinute: 600, endMinute: 720 },
      ],
    }),
  ).rejects.toThrow("cannot overlap");
  expect(await prisma.doctorAvailability.count({ where: { doctorId } })).toBe(
    2,
  );
});
it("audits batch corrections without changing saved invoices or reserved stock", async () => {
  const before = await prisma.batch.findUniqueOrThrow({
    where: { id: batchId },
  });
  const line = await prisma.saleItem.findFirstOrThrow({ where: { batchId } });
  const input = {
    id: batchId,
    batchNo: before.batchNo,
    expiryMonth: before.expiryDate.toISOString().slice(0, 7),
    mrpPaise: 1200,
    purchasePricePaise: 500,
    reason: "Verified packet correction",
    confirmed: true,
  };
  await editBatch(input);
  expect(
    (await prisma.saleItem.findUniqueOrThrow({ where: { id: line.id } }))
      .unitPricePaise,
  ).toBe(line.unitPricePaise);
  await prisma.batch.update({
    where: { id: batchId },
    data: { qtyReserved: 1 },
  });
  try {
    await expect(editBatch(input)).rejects.toThrow("Reconcile offline stock");
  } finally {
    await prisma.batch.update({
      where: { id: batchId },
      data: { qtyReserved: 0 },
    });
  }
});

it("earns and redeems loyalty atomically and reverses points on returns", async () => {
  const oldBranch = ctx.branch;
  ctx.branch = await prisma.branch.update({
    where: { id: ctx.branch.id },
    data: {
      loyaltyEnabled: true,
      loyaltyEarnPaise: 1200,
      loyaltyRedeemPaise: 100,
    },
  });
  try {
    await adjustStock({
      batchId,
      quantity: 20,
      reason: "Loyalty test stock",
      operationId: randomUUID(),
    });
    const customer = await prisma.customer.create({
      data: {
        branchId: ctx.branch.id,
        name: "Loyalty customer",
        phone: `+93${Date.now().toString().slice(-10)}`,
      },
    });
    const first = await checkout({
      ...request(10),
      customerId: customer.id,
      payments: [{ method: "CASH", amountPaise: 12000 }],
    });
    const balance = async () =>
      (
        await prisma.loyaltyEntry.aggregate({
          where: { branchId: ctx.branch.id, customerId: customer.id },
          _sum: { points: true },
        })
      )._sum.points;
    expect(await balance()).toBe(10);
    const second = await checkout({
      ...request(),
      customerId: customer.id,
      loyaltyPoints: 5,
      payments: [{ method: "CASH", amountPaise: 700 }],
    });
    expect(await balance()).toBe(5);
    const returnBill = async (saleId: string, quantity: number) => {
      const line = await prisma.saleItem.findFirstOrThrow({
        where: { saleId },
      });
      await returnSale({
        saleId,
        operationId: randomUUID(),
        reason: "Loyalty return test",
        refundMethod: "CASH",
        items: [{ saleItemId: line.id, quantity }],
      });
    };
    await returnBill(second, 1);
    expect(await balance()).toBe(10);
    await returnBill(first, 5);
    expect(await balance()).toBe(5);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        checkout({
          ...request(),
          customerId: customer.id,
          loyaltyPoints: 5,
          payments: [{ method: "CASH", amountPaise: 700 }],
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance()).toBe(0);
    await returnBill(first, 5);
    expect(await balance()).toBe(-5);
  } finally {
    ctx.branch = await prisma.branch.update({
      where: { id: oldBranch.id },
      data: {
        loyaltyEnabled: oldBranch.loyaltyEnabled,
        loyaltyEarnPaise: oldBranch.loyaltyEarnPaise,
        loyaltyRedeemPaise: oldBranch.loyaltyRedeemPaise,
      },
    });
  }
});

it("reserves offline stock, syncs once and releases only unsold stock", async () => {
  const before = await prisma.batch.findUniqueOrThrow({
    where: { id: batchId },
  });
  const identity = {
    deviceId: randomUUID(),
    secret: randomBytes(32).toString("base64url"),
  };
  const bundle = await prepareOffline({
    ...identity,
    name: "Integration counter",
    items: [{ batchId, quantity: 3 }],
  });
  expect(bundle.items[0].available).toBe(3);
  expect(
    (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
      .qtyReserved,
  ).toBe(before.qtyReserved + 3);
  const input = {
    ...request(2),
    items: [{ medicineId, batchId, quantity: 2 }],
    payments: [{ method: "CASH", amountPaise: before.mrpPaise * 2 }],
  };
  const results = await Promise.all([
    checkout(input, identity),
    checkout(input, identity),
  ]);
  expect(results[0]).toBe(results[1]);
  const after = await prisma.batch.findUniqueOrThrow({
    where: { id: batchId },
  });
  expect(after.qtyOnHand).toBe(before.qtyOnHand - 2);
  expect(after.qtyReserved).toBe(before.qtyReserved + 1);
  await expect(
    checkout(
      { ...input, items: [{ medicineId, batchId, quantity: 1 }] },
      identity,
    ),
  ).rejects.toThrow("different contents");
  await expect(
    checkout({ ...input, operationId: randomUUID() }, identity),
  ).rejects.toThrow("enough unexpired stock");
  await closeOffline({ ...identity, confirmed: true });
  await closeOffline({ ...identity, confirmed: true });
  expect(
    (await prisma.batch.findUniqueOrThrow({ where: { id: batchId } }))
      .qtyReserved,
  ).toBe(before.qtyReserved);
  expect(await checkout(input, identity)).toBe(results[0]);
  await expect(
    checkout({ ...input, operationId: randomUUID() }, identity),
  ).rejects.toThrow("was closed");
});
