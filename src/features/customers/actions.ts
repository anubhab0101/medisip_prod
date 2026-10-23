"use server";
import { z } from "zod";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { name, phone } from "@/lib/validation";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
export async function customerAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.CUSTOMER);
      const input = z
        .object({
          name,
          phone,
          email: z.union([z.string().email(), z.literal("")]),
          consentSms: z.boolean(),
          consentWhatsapp: z.boolean(),
          consentEmail: z.boolean(),
        })
        .parse({
          name: text(form, "name"),
          phone: text(form, "phone"),
          email: text(form, "email"),
          consentSms: form.get("consentSms") === "on",
          consentWhatsapp: form.get("consentWhatsapp") === "on",
          consentEmail: form.get("consentEmail") === "on",
        });
      const customer = await db().customer.create({
        data: { branchId: ctx.branch.id, ...input },
      });
      return customer.id;
    },
    ["/customers", "/billing"],
    "Customer added.",
  );
}
