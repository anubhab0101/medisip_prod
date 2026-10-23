import { z } from "zod";
import { id, operationId, quantity } from "@/lib/validation";
export const draftSchema = z.object({
  version: z.literal(2),
  operationId,
  loyaltyPoints: z.number().int().min(0).max(1000000).default(0),
  cart: z
    .array(
      z.object({
        medicine: z.object({ id }),
        quantity,
        discountBasisPoints: z.number().int().min(0).max(10000),
        batchId: z.string().max(100),
      }),
    )
    .min(1)
    .max(100),
  customerId: z.string().max(100).default(""),
  discount: z.string().max(30).default("0"),
  doctorName: z.string().max(150).default(""),
  prescriptionRef: z.string().max(200).default(""),
});
export type BillDraft = z.infer<typeof draftSchema>;
