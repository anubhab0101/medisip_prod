import { z } from "zod";
import { Schedule } from "@prisma/client";
import { id, name, paise, quantity, operationId } from "@/lib/validation";
export const medicineSchema = z.object({
  name,
  genericName: z.string().trim().max(150).default(""),
  strength: z.string().trim().max(80).default(""),
  dosageForm: z.string().trim().min(1).max(50).default("tablet"),
  manufacturer: z.string().trim().max(150).default(""),
  hsn: z.string().trim().max(20).default(""),
  gstBasisPoints: z.number().int().min(0).max(10000),
  packSize: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(100).default(""),
  schedule: z.nativeEnum(Schedule),
  reorderLevel: z.number().int().min(0).max(100000),
  rack: z.string().trim().max(50).default(""),
});
export const purchaseSchema = z.object({
  orderId: id.optional(),
  operationId,
  supplierId: id,
  invoiceNo: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(
      z.object({
        medicineId: id,
        batchNo: z.string().trim().min(1).max(100),
        expiryMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        quantity,
        unitCostPaise: paise,
        mrpPaise: paise,
      }),
    )
    .min(1)
    .max(100),
});
export const adjustmentSchema = z.object({
  type: z.enum(["ADJUST", "EXPIRED"]).default("ADJUST"),
  batchId: id,
  quantity: z
    .number()
    .int()
    .min(-1000000)
    .max(1000000)
    .refine((q) => q !== 0),
  reason: z.string().trim().min(3).max(300),
  operationId,
});
