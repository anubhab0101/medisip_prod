import { createHash } from "node:crypto";
import { checkDeviceSecret, offlineIdentity } from "@/features/offline/service";
import { lockLoyalty, redeemLoyalty } from "@/features/loyalty/service";
import "server-only";
import {
  MovementType,
  PaymentMethod,
  Prisma,
  SaleStatus,
  Schedule,
  type Batch,
  type Medicine,
  type Device,
  type StockReservation,
} from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { financialYear, shopDate } from "@/lib/date";
import { checkoutSchema } from "./schema";
import { calculateBill } from "./pricing";
export async function checkout(
  raw: unknown,
  offline?: { deviceId: string; secret: string },
) {
  const ctx = await context(Permission.BILL);
  const input = checkoutSchema.parse(raw);
  if (offline) offlineIdentity.parse(offline);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  return transaction(async (tx) => {
    if (offline) {
      const [device] = await tx.$queryRaw<
        Device[]
      >`SELECT * FROM Device WHERE id=${offline.deviceId} AND branchId=${ctx.branch.id} AND userId=${ctx.user.id} FOR UPDATE`;
      if (!device)
        throw new BusinessError(
          "Offline counter is unavailable for this staff account.",
          "UNAVAILABLE",
        );
      checkDeviceSecret(device, offline.secret);
      const [recorded] = await tx.$queryRaw<
        { deviceId: string; payloadHash: string; saleId: string }[]
      >`SELECT deviceId,payloadHash,saleId FROM OfflineOperation WHERE id=${input.operationId} FOR UPDATE`;
      if (recorded) {
        if (
          recorded.deviceId !== device.id ||
          recorded.payloadHash !== payloadHash
        )
          throw new BusinessError(
            "Offline bill identity was reused with different contents.",
            "CONFLICT",
          );
        return recorded.saleId;
      }
      if (!device.active)
        throw new BusinessError(
          "This offline counter was closed. Reconcile this bill with the owner.",
          "EXPIRED",
        );
      if (
        input.customerId ||
        input.loyaltyPoints ||
        input.items.some((i) => !i.batchId) ||
        input.payments.some((p) => p.method === "CREDIT")
      )
        throw new BusinessError(
          "Offline bills need reserved stock and walk-in payments. Customer credit and loyalty require online billing.",
          "VALIDATION_ERROR",
        );
      if (
        input.payments.some((p) => p.method !== "CASH" && !p.reference.trim())
      )
        throw new BusinessError(
          "Enter the independently confirmed UPI/card payment reference before syncing.",
          "VALIDATION_ERROR",
        );
    }
    const previous = await tx.sale.findUnique({
      where: { operationId: input.operationId },
    });
    if (previous) {
      if (offline)
        throw new BusinessError("This bill identity was already used online.", "CONFLICT");
      if (previous.branchId !== ctx.branch.id)
        throw new BusinessError("This request belongs to another shop.", "CONFLICT");
      return previous.id;
    }
    if (!ctx.branch.name || !ctx.branch.address || !ctx.branch.drugLicenseNo)
      throw new BusinessError(
        "Ask the owner to finish shop details before making a bill.",
        "VALIDATION_ERROR",
      );
    const customer = input.customerId
      ? await tx.customer.findFirst({
          where: {
            id: input.customerId,
            branchId: ctx.branch.id,
            active: true,
          },
        })
      : null;
    if (input.customerId && !customer)
      throw new BusinessError("Customer not found in this shop.");
    if (input.loyaltyPoints && (!customer || !ctx.branch.loyaltyEnabled))
      throw new BusinessError(
        "Choose a customer in a shop with loyalty enabled.",
      );
    const loyaltyBalance =
      customer && ctx.branch.loyaltyEnabled
        ? await lockLoyalty(tx, ctx.branch.id, customer.id)
        : 0;
    const loyaltyDiscount = input.loyaltyPoints * ctx.branch.loyaltyRedeemPaise;
    const medicineIds = [
      ...new Set(input.items.map((i) => i.medicineId)),
    ].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM Medicine WHERE id IN (${Prisma.join(medicineIds)}) ORDER BY id FOR UPDATE`,
    );
    const medicines = await tx.$queryRaw<Medicine[]>(
      Prisma.sql`SELECT m.* FROM Medicine m JOIN BranchMedicine bm ON bm.medicineId=m.id WHERE m.id IN (${Prisma.join(medicineIds)}) AND m.active=1 AND bm.branchId=${ctx.branch.id} AND bm.active=1 ORDER BY m.id FOR UPDATE`,
    );
    if (medicines.length !== medicineIds.length)
      throw new BusinessError(
        "A medicine in this bill is no longer available.",
      );
    const requiresPrescription = medicines.some((m) => m.schedule !== Schedule.NONE);
    const approvedPrescription = requiresPrescription && input.prescriptionId
      ? await tx.prescription.findFirst({
          where: {
            id: input.prescriptionId,
            branchId: ctx.branch.id,
            customerId: customer?.id ?? "",
            status: "APPROVED",
          },
          select: { id: true, doctorName: true, reference: true },
        })
      : null;
    if (requiresPrescription && (!customer || !approvedPrescription))
      throw new BusinessError(
        "Choose this customer’s approved prescription before billing prescription medicine.",
      );
    // Use the locking read's values. A later ordinary read may see an older
    // repeatable-read snapshot after another transaction has sold the last unit.
    const batches = await tx.$queryRaw<Batch[]>(
      Prisma.sql`SELECT * FROM Batch WHERE branchId=${ctx.branch.id} AND medicineId IN (${Prisma.join(medicineIds)}) ORDER BY id FOR UPDATE`,
    );
    batches.sort(
      (a, b) =>
        a.expiryDate.getTime() - b.expiryDate.getTime() ||
        a.id.localeCompare(b.id),
    );
    let reservations: StockReservation[] = [];
    if (offline) {
      reservations = await tx.$queryRaw<
        StockReservation[]
      >`SELECT * FROM StockReservation WHERE deviceId=${offline.deviceId} AND branchId=${ctx.branch.id} ORDER BY batchId FOR UPDATE`;
      for (const b of batches) {
        const r = reservations.find((r) => r.batchId === b.id);
        if (r) {
          b.mrpPaise = r.unitPricePaise;
          const m = medicines.find((m) => m.id === b.medicineId)!;
          m.gstBasisPoints = r.gstBasisPoints;
        }
      }
      if (medicines.some((m) => m.schedule !== "NONE"))
        throw new BusinessError("Prescription medicines need online billing.");
    }
    const available = new Map(
      batches.map((b) => {
        const r = reservations.find((r) => r.batchId === b.id);
        return [
          b.id,
          offline
            ? r
              ? r.quantity - r.consumed - r.released
              : 0
            : b.qtyOnHand - b.qtyReserved,
        ];
      }),
    );
    const allocated = [];
    const today = shopDate();
    for (const item of input.items) {
      const medicine = medicines.find((m) => m.id === item.medicineId)!;
      let remaining = item.quantity;
      for (const batch of batches.filter(
        (b) =>
          b.medicineId === item.medicineId &&
          (!item.batchId || b.id === item.batchId) &&
          b.expiryDate.toISOString().slice(0, 10) >= today,
      )) {
        const take = Math.min(remaining, available.get(batch.id) ?? 0);
        if (take <= 0) continue;
        allocated.push({
          medicine,
          batch,
          quantity: take,
          discountBasisPoints: item.discountBasisPoints,
        });
        available.set(batch.id, (available.get(batch.id) ?? 0) - take);
        remaining -= take;
        if (!remaining) break;
      }
      if (remaining)
        throw new BusinessError(
          `${medicine.name} does not have enough unexpired stock. Reduce quantity or choose another batch.`,
        );
    }
    const pricing = calculateBill(
      allocated.map((line) => ({
        unitPricePaise: line.batch.mrpPaise,
        quantity: line.quantity,
        gstBasisPoints: line.medicine.gstBasisPoints,
        discountBasisPoints: line.discountBasisPoints,
      })),
      input.billDiscountPaise + loyaltyDiscount,
    );
    if (pricing.subtotalPaise > 2_000_000_000)
      throw new BusinessError(
        "This bill is too large. Split it into smaller bills.",
      );
    if (
      input.payments.reduce((sum, p) => sum + p.amountPaise, 0) !==
      pricing.totalPaise
    )
      throw new BusinessError("Payment amounts must match the bill total.");
    const creditPaise = input.payments
      .filter((p) => p.method === PaymentMethod.CREDIT)
      .reduce((sum, p) => sum + p.amountPaise, 0);
    if (creditPaise && !customer)
      throw new BusinessError("Choose a customer before adding credit.");
    const fy = financialYear();
    await tx.$executeRaw`INSERT INTO InvoiceCounter (branchId, financialYear, nextNumber) VALUES (${ctx.branch.id},${fy},1) ON DUPLICATE KEY UPDATE nextNumber=nextNumber`;
    await tx.$queryRaw`SELECT nextNumber FROM InvoiceCounter WHERE branchId=${ctx.branch.id} AND financialYear=${fy} FOR UPDATE`;
    const counter = await tx.invoiceCounter.update({
      where: {
        branchId_financialYear: { branchId: ctx.branch.id, financialYear: fy },
      },
      data: { nextNumber: { increment: 1 } },
    });
    const { lines, ...totals } = pricing;
    const sale = await tx.sale.create({
      data: {
        ...totals,
        branchId: ctx.branch.id,
        operationId: input.operationId,
        invoiceNo: `${ctx.branch.invoicePrefix}/${fy}/${String(counter.nextNumber - 1).padStart(6, "0")}`,
        customerId: customer?.id,
        userId: ctx.user.id,
        creditPaise,
        status: creditPaise ? SaleStatus.PARTIAL : SaleStatus.PAID,
        doctorName: approvedPrescription?.doctorName ?? input.doctorName,
        prescriptionRef: approvedPrescription?.reference ?? input.prescriptionRef,
        prescriptionId: approvedPrescription?.id,
        shopSnapshot: {
          name: ctx.branch.name,
          address: ctx.branch.address,
          phone: ctx.branch.phone,
          gstin: ctx.branch.gstin,
          drugLicenseNo: ctx.branch.drugLicenseNo,
        },
        customerSnapshot: customer
          ? { name: customer.name, phone: customer.phone }
          : Prisma.JsonNull,
        payments: { create: input.payments },
      },
    });
    for (let i = 0; i < allocated.length; i++) {
      const line = allocated[i];
      const amounts = lines[i];
      await tx.saleItem.create({
        data: {
          saleId: sale.id,
          medicineId: line.medicine.id,
          batchId: line.batch.id,
          name: line.medicine.name,
          hsn: line.medicine.hsn,
          schedule: line.medicine.schedule,
          batchNo: line.batch.batchNo,
          expiryDate: line.batch.expiryDate,
          quantity: line.quantity,
          unitPricePaise: line.batch.mrpPaise,
          unitCostPaise: line.batch.purchasePricePaise,
          discountBasisPoints: line.discountBasisPoints,
          gstBasisPoints: line.medicine.gstBasisPoints,
          discountPaise: amounts.discountPaise,
          taxablePaise: amounts.taxablePaise,
          cgstPaise: amounts.cgstPaise,
          sgstPaise: amounts.sgstPaise,
          totalPaise: amounts.totalPaise,
        },
      });
      await tx.batch.update({
        where: { id: line.batch.id },
        data: {
          qtyOnHand: { decrement: line.quantity },
          ...(offline ? { qtyReserved: { decrement: line.quantity } } : {}),
        },
      });
      if (offline)
        await tx.stockReservation.update({
          where: {
            id: reservations.find((r) => r.batchId === line.batch.id)!.id,
          },
          data: { consumed: { increment: line.quantity } },
        });
      await tx.stockMovement.create({
        data: {
          branchId: ctx.branch.id,
          batchId: line.batch.id,
          type: MovementType.SALE,
          quantity: -line.quantity,
          reason: `Bill ${sale.invoiceNo}`,
          userId: ctx.user.id,
          refId: sale.id,
        },
      });
    }
    if (customer && creditPaise)
      await tx.creditEntry.create({
        data: {
          branchId: ctx.branch.id,
          customerId: customer.id,
          saleId: sale.id,
          amountPaise: creditPaise,
          reason: "Sale on credit",
          operationId: `credit:${input.operationId}`,
          userId: ctx.user.id,
        },
      });
    if (customer && ctx.branch.loyaltyEnabled) {
      await redeemLoyalty(
        tx,
        ctx.branch.id,
        customer.id,
        input.loyaltyPoints,
        loyaltyBalance,
        sale.id,
        input.operationId,
      );
      const points = Math.floor(
        pricing.totalPaise / ctx.branch.loyaltyEarnPaise,
      );
      if (points)
        await tx.loyaltyEntry.create({
          data: {
            branchId: ctx.branch.id,
            customerId: customer.id,
            saleId: sale.id,
            points,
            reason: "EARN",
            operationId: `loyalty-earn:${input.operationId}`,
          },
        });
    }
    await tx.heldBill.deleteMany({
      where: {
        id: input.operationId,
        branchId: ctx.branch.id,
        userId: ctx.user.id,
      },
    });
    if (offline) {
      await tx.offlineOperation.create({
        data: {
          id: input.operationId,
          deviceId: offline.deviceId,
          payloadHash,
          saleId: sale.id,
        },
      });
      await tx.auditLog.create({
        data: {
          branchId: ctx.branch.id,
          userId: ctx.user.id,
          action: "SYNC_OFFLINE",
          entity: "Sale",
          entityId: sale.id,
          after: {
            deviceId: offline.deviceId,
            provisionalId: input.operationId,
          },
        },
      });
    }
    return sale.id;
  });
}
