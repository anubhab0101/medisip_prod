"use server";
import { shopSchema } from "./shop-schema";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";

import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
export async function shopAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.SETTINGS);
      const input = shopSchema.parse({
        name: text(form, "name"),
        address: text(form, "address"),
        phone: text(form, "phone"),
        gstin: text(form, "gstin"),
        drugLicenseNo: text(form, "drugLicenseNo"),
        invoicePrefix: text(form, "invoicePrefix"),
      });
      return transaction(async (tx) => {
        await tx.branch.update({ where: { id: ctx.branch.id }, data: input });
        await tx.auditLog.create({
          data: {
            branchId: ctx.branch.id,
            userId: ctx.user.id,
            action: "UPDATE",
            entity: "Branch",
            entityId: ctx.branch.id,
            after: input,
          },
        });
      });
    },
    ["/settings", "/dashboard", "/settings/setup"],
    "Shop details saved.",
  );
}
