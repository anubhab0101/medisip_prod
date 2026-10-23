import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { operationId } from "@/lib/validation";
import { BusinessError } from "@/lib/errors";
import { medicineSchema } from "./schema";
import { parseMedicineRows } from "./import-schema";
const key = (m: {
  name: string;
  strength: string;
  dosageForm: string;
  packSize: string;
}) =>
  [m.name, m.strength, m.dosageForm, m.packSize]
    .map((s) => s.trim().toLowerCase())
    .join("|");
export async function previewMedicineImport(raw: unknown) {
  const ctx = await context(Permission.MEDICINE_WRITE);
  const rows = parseMedicineRows(raw);
  const candidates = rows.flatMap((r) => (r.data ? [r.data] : []));
  const existing = await db().medicine.findMany({
    where: {
      OR: [
        { barcode: { in: candidates.map((r) => r.barcode).filter(Boolean) } },
        {
          name: { in: candidates.map((r) => r.name) },
          branchSettings: { some: { branchId: ctx.branch.id } },
        },
      ],
    },
    select: {
      name: true,
      strength: true,
      dosageForm: true,
      packSize: true,
      barcode: true,
    },
  });
  const keys = new Set(existing.map(key)),
    barcodes = new Set(
      existing.flatMap((m) => (m.barcode ? [m.barcode.toLowerCase()] : [])),
    );
  return rows.map((row) => {
    if (!row.data) return row;
    if (
      keys.has(key(row.data)) ||
      (row.data.barcode && barcodes.has(row.data.barcode.toLowerCase()))
    )
      return {
        row: row.row,
        error:
          "Duplicate medicine or barcode. Edit the existing medicine instead.",
      };
    keys.add(key(row.data));
    if (row.data.barcode) barcodes.add(row.data.barcode.toLowerCase());
    return row;
  });
}
export async function importMedicines(raw: unknown) {
  const ctx = await context(Permission.MEDICINE_WRITE);
  const input = z
    .object({
      operationId,
      rows: z.array(medicineSchema).min(1).max(500),
      confirmed: z.literal(true),
    })
    .parse(raw);
  return transaction(async (tx) => {
    const prior = await tx.auditLog.findUnique({
      where: { id: input.operationId },
    });
    if (prior) {
      if (
        prior.branchId !== ctx.branch.id ||
        prior.action !== "IMPORT_MEDICINES"
      )
        throw new BusinessError("Import request belongs to another operation.");
      return prior.id;
    }
    const existing = await tx.medicine.findMany({
      where: {
        name: { in: input.rows.map((r) => r.name) },
        branchSettings: { some: { branchId: ctx.branch.id } },
      },
    });
    const keys = new Set(existing.map(key)),
      barcodes = new Set<string>();
    for (const row of input.rows) {
      if (
        keys.has(key(row)) ||
        (row.barcode && barcodes.has(row.barcode.toLowerCase()))
      )
        throw new BusinessError(
          `Duplicate medicine: ${row.name}. Refresh the import preview.`,
        );
      keys.add(key(row));
      if (row.barcode) barcodes.add(row.barcode.toLowerCase());
    }
    const medicines = input.rows.map((row) => ({ ...row, id: randomUUID() }));
    await tx.auditLog.create({
      data: {
        id: input.operationId,
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "IMPORT_MEDICINES",
        entity: "Medicine",
        entityId: input.operationId,
        after: { count: medicines.length },
      },
    });
    await tx.medicine.createMany({
      data: medicines.map((m) => ({
        id: m.id,
        name: m.name,
        genericName: m.genericName,
        strength: m.strength,
        dosageForm: m.dosageForm,
        manufacturer: m.manufacturer,
        hsn: m.hsn,
        gstBasisPoints: m.gstBasisPoints,
        packSize: m.packSize,
        schedule: m.schedule,
        barcode: m.barcode || null,
      })),
    });
    await tx.branchMedicine.createMany({
      data: medicines.map((m) => ({
        branchId: ctx.branch.id,
        medicineId: m.id,
        rack: m.rack,
        reorderLevel: m.reorderLevel,
      })),
    });
    return input.operationId;
  });
}
