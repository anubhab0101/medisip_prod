import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { shopDate } from "@/lib/date";
import { reportRange, reportLabels } from "./schema";
const rupees = (n: number) => (n / 100).toFixed(2);
const limit = 10001;
function bounded<T>(rows: T[]) {
  if (rows.length >= limit)
    throw new Error("Too many records. Choose a shorter date range.");
  return rows;
}
const returnedItems = z.array(
  z.object({
    saleItemId: z.string(),
    quantity: z.number(),
    taxablePaise: z.number(),
    cgstPaise: z.number(),
    sgstPaise: z.number(),
  }),
);
export async function getReport(raw: Record<string, string | undefined>) {
  const ctx = await context(Permission.REPORT);
  const range = reportRange(raw);
  const { kind, start, end } = range;
  const branchId = ctx.branch.id;
  let headers: string[] = [],
    rows: (string | number)[][] = [];
  let note = "Amounts in rupees. Dates use India time.";
  if (kind === "expiry-loss") {
    const [movements, audits] = await Promise.all([
      db().stockMovement.findMany({
        where: {
          branchId,
          type: "EXPIRED",
          quantity: { lt: 0 },
          createdAt: { gte: start, lt: end },
        },
        include: { batch: { include: { medicine: true } } },
        orderBy: { createdAt: "asc" },
        take: limit,
      }),
      db().auditLog.findMany({
        where: {
          branchId,
          action: "ADJUST",
          createdAt: { gte: start, lt: end },
        },
        select: { after: true },
        take: limit,
      }),
    ]);
    bounded(movements);
    bounded(audits);
    const costs = new Map<string, number>();
    for (const audit of audits) {
      const snapshot = z
        .object({
          movementId: z.string(),
          unitCostPaise: z.number().int().nonnegative(),
        })
        .safeParse(audit.after);
      if (snapshot.success)
        costs.set(snapshot.data.movementId, snapshot.data.unitCostPaise);
    }
    headers = [
      "Date",
      "Medicine",
      "Batch",
      "Units written off",
      "Recorded loss (INR)",
      "Reason",
    ];
    rows = movements.map((movement) => [
      shopDate(movement.createdAt),
      movement.batch.medicine.name,
      movement.batch.batchNo,
      -movement.quantity,
      costs.has(movement.id)
        ? rupees(-movement.quantity * costs.get(movement.id)!)
        : "Cost unavailable",
      movement.reason,
    ]);
    note +=
      " Explicit expired-stock write-offs only, valued at the cost saved when stock was removed. Stock still on the shelf is excluded; older records without a cost snapshot are marked unavailable.";
  } else if (kind === "purchase-sales") {
    const [purchases, sales, refunds] = await Promise.all([
      db().purchase.findMany({
        where: { branchId, date: { gte: start, lt: end } },
        select: { date: true, totalPaise: true },
        take: limit,
      }),
      db().sale.findMany({
        where: { branchId, createdAt: { gte: start, lt: end } },
        select: { createdAt: true, totalPaise: true },
        take: limit,
      }),
      db().saleReturn.findMany({
        where: { sale: { branchId }, createdAt: { gte: start, lt: end } },
        select: { createdAt: true, amountPaise: true },
        take: limit,
      }),
    ]);
    bounded(purchases);
    bounded(sales);
    bounded(refunds);
    const days = new Map<
      string,
      { purchases: number; sales: number; refunds: number }
    >();
    const add = (
      date: Date,
      key: "purchases" | "sales" | "refunds",
      amount: number,
    ) => {
      const day = shopDate(date),
        totals = days.get(day) ?? { purchases: 0, sales: 0, refunds: 0 };
      totals[key] += amount;
      days.set(day, totals);
    };
    purchases.forEach((p) => add(p.date, "purchases", p.totalPaise));
    sales.forEach((s) => add(s.createdAt, "sales", s.totalPaise));
    refunds.forEach((r) => add(r.createdAt, "refunds", r.amountPaise));
    headers = [
      "Date",
      "Purchases (INR)",
      "Sales (INR)",
      "Refunds (INR)",
      "Net sales (INR)",
    ];
    rows = [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, totals]) => [
        day,
        rupees(totals.purchases),
        rupees(totals.sales),
        rupees(totals.refunds),
        rupees(totals.sales - totals.refunds),
      ]);
    note +=
      " Compares recorded purchase cost with billed sales including GST, discounts and rounding. Refunds appear on their own date. This is not a profit or cash-flow calculation.";
  } else if (kind === "purchases") {
    const purchases = bounded(
      await db().purchase.findMany({
        where: { branchId, date: { gte: start, lt: end } },
        include: { supplier: true },
        orderBy: { date: "asc" },
        take: limit,
      }),
    );
    headers = ["Date", "Supplier", "Invoice", "Amount (INR)"];
    rows = purchases.map((p) => [
      shopDate(p.date),
      p.supplier.name,
      p.invoiceNo,
      rupees(p.totalPaise),
    ]);
  } else if (kind === "credit") {
    const balances = bounded(
      await db().creditEntry.groupBy({
        by: ["customerId"],
        where: { branchId },
        _sum: { amountPaise: true },
        take: limit,
        orderBy: { customerId: "asc" },
      }),
    );
    const customers = await db().customer.findMany({
      where: { branchId, id: { in: balances.map((b) => b.customerId) } },
      select: { id: true, name: true, phone: true },
    });
    headers = ["Customer", "Phone", "Outstanding (INR)"];
    rows = balances
      .filter((b) => (b._sum.amountPaise ?? 0) !== 0)
      .map((b) => {
        const c = customers.find((c) => c.id === b.customerId);
        return [
          c?.name ?? "Archived customer",
          c?.phone ?? "",
          rupees(b._sum.amountPaise ?? 0),
        ];
      });
    note += " Current balances, independent of the date range.";
  } else if (kind === "expiry") {
    const batches = bounded(
      await db().batch.findMany({
        where: { branchId, qtyOnHand: { gt: 0 } },
        include: { medicine: true },
        orderBy: { expiryDate: "asc" },
        take: limit,
      }),
    );
    headers = [
      "Medicine",
      "Batch",
      "Expiry",
      "On hand",
      "Reserved",
      "Available",
      "Cost value (INR)",
    ];
    rows = batches.map((b) => [
      b.medicine.name,
      b.batchNo,
      b.expiryDate.toISOString().slice(0, 10),
      b.qtyOnHand,
      b.qtyReserved,
      b.qtyOnHand - b.qtyReserved,
      rupees(b.qtyOnHand * b.purchasePricePaise),
    ]);
    note +=
      " Current stock, ordered by expiry; expired stock is included for review.";
  } else {
    const [sales, refunds] = await Promise.all([
      db().sale.findMany({
        where: { branchId, createdAt: { gte: start, lt: end } },
        include: { items: true },
        orderBy: { createdAt: "asc" },
        take: limit,
      }),
      db().saleReturn.findMany({
        where: { sale: { branchId }, createdAt: { gte: start, lt: end } },
        include: { sale: { include: { items: true } } },
        take: limit,
      }),
    ]);
    bounded(sales);
    bounded(refunds);
    const staff =
      kind === "staff"
        ? await db().user.findMany({
            where: {
              id: {
                in: [
                  ...new Set([
                    ...sales.map((s) => s.userId),
                    ...refunds.map((r) => r.sale.userId),
                  ]),
                ],
              },
            },
            select: { id: true, name: true },
          })
        : [];
    const staffName = (id: string) =>
      staff.find((u) => u.id === id)?.name ?? "Former staff";
    if (kind === "sales") {
      headers = ["Date", "Type", "Invoice", "Amount (INR)"];
      rows = [
        ...sales.map((s) => [
          shopDate(s.createdAt),
          "Sale",
          s.invoiceNo,
          rupees(s.totalPaise),
        ]),
        ...refunds.map((r) => [
          shopDate(r.createdAt),
          "Refund",
          r.sale.invoiceNo,
          rupees(-r.amountPaise),
        ]),
      ];
    } else {
      const groups = new Map<
        string,
        {
          name: string;
          units: number;
          taxable: number;
          cgst: number;
          sgst: number;
          cost: number;
        }
      >();
      const add = (
        key: string,
        name: string,
        units: number,
        taxable: number,
        cgst: number,
        sgst: number,
        cost: number,
      ) => {
        const g = groups.get(key) ?? {
          name,
          units: 0,
          taxable: 0,
          cgst: 0,
          sgst: 0,
          cost: 0,
        };
        g.units += units;
        g.taxable += taxable;
        g.cgst += cgst;
        g.sgst += sgst;
        g.cost += cost;
        groups.set(key, g);
      };
      for (const s of sales)
        for (const i of s.items) {
          const key =
            kind === "gst"
              ? `${i.hsn}|${i.gstBasisPoints}`
              : kind === "staff"
                ? s.userId
                : i.medicineId;
          const name =
            kind === "gst"
              ? `${i.hsn || "No HSN"} / ${i.gstBasisPoints / 100}%`
              : kind === "staff"
                ? staffName(s.userId)
                : i.name;
          add(
            key,
            name,
            i.quantity,
            i.taxablePaise,
            i.cgstPaise,
            i.sgstPaise,
            i.unitCostPaise * i.quantity,
          );
        }
      for (const r of refunds)
        for (const item of returnedItems.parse(r.items)) {
          const i = r.sale.items.find((i) => i.id === item.saleItemId);
          if (!i) throw new Error("Return item snapshot is missing.");
          const key =
            kind === "gst"
              ? `${i.hsn}|${i.gstBasisPoints}`
              : kind === "staff"
                ? r.sale.userId
                : i.medicineId;
          const name =
            kind === "gst"
              ? `${i.hsn || "No HSN"} / ${i.gstBasisPoints / 100}%`
              : kind === "staff"
                ? staffName(r.sale.userId)
                : i.name;
          add(
            key,
            name,
            -item.quantity,
            -item.taxablePaise,
            -item.cgstPaise,
            -item.sgstPaise,
            -i.unitCostPaise * item.quantity,
          );
        }
      if (kind === "slow") {
        const meds = bounded(
          await db().medicine.findMany({
            where: {
              active: true,
              branchSettings: { some: { branchId, active: true } },
            },
            select: { id: true, name: true },
            take: limit,
          }),
        );
        for (const m of meds)
          if (!groups.has(m.id)) add(m.id, m.name, 0, 0, 0, 0, 0);
      }
      const data = [...groups.values()].sort((a, b) =>
        kind === "slow" ? a.units - b.units : b.taxable - a.taxable,
      );
      if (kind === "gst") {
        headers = [
          "HSN / GST rate",
          "Taxable (INR)",
          "CGST (INR)",
          "SGST (INR)",
        ];
        rows = data.map((g) => [
          g.name,
          rupees(g.taxable),
          rupees(g.cgst),
          rupees(g.sgst),
        ]);
      } else if (kind === "profit") {
        headers = [
          "Medicine",
          "Net units",
          "Revenue before GST (INR)",
          "Recorded cost (INR)",
          "Gross margin (INR)",
        ];
        rows = data.map((g) => [
          g.name,
          g.units,
          rupees(g.taxable),
          rupees(g.cost),
          rupees(g.taxable - g.cost),
        ]);
        note +=
          " Gross margin uses recorded batch cost; excludes overheads and purchase-tax adjustments.";
      } else {
        headers = [
          kind === "staff" ? "Staff" : "Medicine",
          "Net units",
          "Sales before GST (INR)",
        ];
        rows = data.map((g) => [g.name, g.units, rupees(g.taxable)]);
      }
      note +=
        " Sales and returns are recognized on their respective dates; a return may relate to an older bill.";
    }
  }
  return {
    ...range,
    title: reportLabels[kind],
    shop: ctx.branch.name,
    headers,
    rows,
    note,
  };
}
