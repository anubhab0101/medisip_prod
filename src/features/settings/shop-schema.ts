import { z } from "zod";
import { name } from "@/lib/validation";
export const shopSchema = z.object({
  name,
  address: z.string().trim().min(5).max(1000),
  phone: z.string().trim().min(10).max(20),
  gstin: z.string().trim().max(30),
  drugLicenseNo: z.string().trim().min(1).max(100),
  invoicePrefix: z
    .string()
    .regex(
      /^[A-Z0-9-]{1,12}$/,
      "Use 1–12 uppercase letters, numbers or hyphens for the invoice prefix.",
    ),
});
