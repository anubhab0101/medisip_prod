import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { id, operationId, paise, quantity } from "@/lib/validation";
export const checkoutSchema = z.object({
  operationId,
  loyaltyPoints: z.number().int().min(0).max(1000000).default(0),
  customerId: id.optional(),
  prescriptionId: id.optional(),
  doctorName: z.string().trim().max(150).default(""),
  prescriptionRef: z.string().trim().max(200).default(""),
  billDiscountPaise: paise.default(0),
  items: z
    .array(
      z.object({
        medicineId: id,
        batchId: id.optional(),
        quantity,
        discountBasisPoints: z.number().int().min(0).max(10000).default(0),
      }),
    )
    .min(1)
    .max(100),
  payments: z
    .array(
      z.object({
        method: z.nativeEnum(PaymentMethod),
        amountPaise: paise,
        reference: z.string().trim().max(100).default(""),
      }),
    )
    .min(1)
    .max(4),
});
