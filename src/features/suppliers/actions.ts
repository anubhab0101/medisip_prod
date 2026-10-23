"use server";
import { z } from "zod";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { name } from "@/lib/validation";
import { id } from "@/lib/validation";
import { transaction } from "@/server/transaction";
import { BusinessError } from "@/lib/errors";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
export async function supplierAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.STOCK_WRITE);
      const input = z
        .object({ name, phone: z.string().max(30), gstin: z.string().max(30) })
        .parse({
          name: text(form, "name"),
          phone: text(form, "phone"),
          gstin: text(form, "gstin"),
        });
      return (
        await db().supplier.create({
          data: { branchId: ctx.branch.id, ...input },
        })
      ).id;
    },
    ["/purchases", "/settings/setup"],
    "Supplier added.",
  );
}
export async function updateSupplierAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.STOCK_WRITE);
      const input = z
        .object({
          id,
          name,
          phone: z.string().trim().max(30),
          gstin: z.string().trim().max(30),
          active: z.boolean(),
        })
        .parse({
          id: text(form, "id"),
          name: text(form, "name"),
          phone: text(form, "phone"),
          gstin: text(form, "gstin"),
          active: form.get("active") === "on",
        });
      if (!input.active && form.get("confirmed") !== "on")
        throw new BusinessError(
          "Confirm that this supplier should be archived.",
        );
      return transaction(async (tx) => {
        const changed = await tx.supplier.updateMany({
          where: { id: input.id, branchId: ctx.branch.id },
          data: {
            name: input.name,
            phone: input.phone,
            gstin: input.gstin,
            active: input.active,
          },
        });
        if (!changed.count)
          throw new BusinessError("Supplier not found in this shop.");
        await tx.auditLog.create({
          data: {
            branchId: ctx.branch.id,
            userId: ctx.user.id,
            action: "UPDATE",
            entity: "Supplier",
            entityId: input.id,
            after: input,
          },
        });
        return input.id;
      });
    },
    ["/suppliers", "/purchases"],
    "Supplier updated. Existing purchases are kept.",
  );
}
