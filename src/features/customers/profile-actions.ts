"use server";
import { z } from "zod";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { id } from "@/lib/validation";
import { parseMoney } from "@/lib/money";
import { saveResult, text } from "@/server/forms";
import { receiveCreditPayment } from "./credit";
import type { FormState } from "@/components/shared/action-form";
export async function creditAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      receiveCreditPayment({
        customerId: text(form, "customerId"),
        operationId: text(form, "operationId"),
        amountPaise: parseMoney(text(form, "amount")),
        method: text(form, "method"),
      }),
    [
      "/customers",
      `/customers/${text(form, "customerId")}`,
      "/reports",
      "/bills",
    ],
    "Credit payment recorded.",
  );
}
export async function consentAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.CUSTOMER);
      const customerId = id.parse(text(form, "customerId"));
      const data = z
        .object({
          consentSms: z.boolean(),
          consentWhatsapp: z.boolean(),
          consentEmail: z.boolean(),
        })
        .parse({
          consentSms: form.get("consentSms") === "on",
          consentWhatsapp: form.get("consentWhatsapp") === "on",
          consentEmail: form.get("consentEmail") === "on",
        });
      return transaction(async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, branchId: ctx.branch.id },
        });
        if (!customer) throw new BusinessError("Customer not found.");
        await tx.customer.update({ where: { id: customerId }, data });
        await tx.auditLog.create({
          data: {
            branchId: ctx.branch.id,
            userId: ctx.user.id,
            action: "CONSENT",
            entity: "Customer",
            entityId: customerId,
            after: data,
          },
        });
      });
    },
    ["/customers", `/customers/${text(form, "customerId")}`],
    "Message preferences saved.",
  );
}
