import { z } from "zod";
export const id = z.string().min(1).max(100);
export const name = z.string().trim().min(1, "Enter a name").max(150);
export const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  )
  .transform((value) => (value.startsWith("+91") ? value : `+91${value}`));
export const paise = z.number().int().min(0).max(2_000_000_000);
export const quantity = z.number().int().min(1).max(1_000_000);
export const operationId = z.string().uuid();
export const pagination = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
});
