"use server";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { checkout } from "./service";
import { saveResult } from "@/server/forms";
import { z } from "zod";
import type { CatalogItem } from "./types";
import { shopDate } from "@/lib/date";
export async function searchCatalog(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const q = z.string().trim().min(1).max(100).parse(raw);
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  type Row = { id: string; name: string; genericName: string; gstBasisPoints: number; schedule: string; batchId: string | null; batchNo: string; expiryDate: Date; qtyOnHand: number; qtyReserved: number; mrpPaise: number };
  const rows = await db().$queryRaw<Row[]>`SELECT m.id,m.name,m.genericName,m.gstBasisPoints,m.schedule,b.id AS batchId,b.batchNo,b.expiryDate,b.qtyOnHand,b.qtyReserved,b.mrpPaise FROM (SELECT m.id,m.name,m.genericName,m.gstBasisPoints,m.schedule FROM Medicine m JOIN BranchMedicine bm ON bm.medicineId=m.id WHERE bm.branchId=${ctx.branch.id} AND bm.active=1 AND m.active=1 AND (m.id=${q} OR m.barcode=${q} OR m.name LIKE ${like} OR m.genericName LIKE ${like}) ORDER BY m.name LIMIT 12) m LEFT JOIN Batch b ON b.medicineId=m.id AND b.branchId=${ctx.branch.id} AND b.expiryDate>=${new Date(shopDate())} AND b.qtyOnHand>0 ORDER BY m.name,b.expiryDate,b.id`;
  const items = new Map<string, CatalogItem>();
  for (const row of rows) {
    const item = items.get(row.id) ?? { id: row.id, name: row.name, genericName: row.genericName, gstBasisPoints: row.gstBasisPoints, schedule: row.schedule, batches: [] };
    if (row.batchId) item.batches.push({ id: row.batchId, batchNo: row.batchNo, expiryDate: row.expiryDate, qtyOnHand: row.qtyOnHand, qtyReserved: row.qtyReserved, mrpPaise: row.mrpPaise });
    items.set(row.id,item);
  }
  return [...items.values()];
}
export async function checkoutAction(raw: unknown) {
  return saveResult(
    () => checkout(raw),
    ["/dashboard", "/billing", "/bills", "/stock", "/medicines"],
    "Bill saved.",
  );
}
