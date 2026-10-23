"use server";
import { z } from "zod";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { phone } from "@/lib/validation";
import { BusinessError } from "@/lib/errors";
import { saveResult } from "@/server/forms";
export async function quickCustomerAction(raw: unknown) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.CUSTOMER);
      const input = z
        .object({ phone, name: z.string().trim().max(150) })
        .parse(raw);
      const existing = await db().customer.findUnique({
        where: {
          branchId_phone: { branchId: ctx.branch.id, phone: input.phone },
        },
      });
      if (existing) {
        if (!existing.active)
          throw new BusinessError(
            "This customer is archived. Ask the owner to restore them.",
          );
        return existing.id;
      }
      if (!input.name)
        throw new BusinessError("New customer: enter their name to add them.");
      return (
        await db().customer.upsert({
          where: {
            branchId_phone: { branchId: ctx.branch.id, phone: input.phone },
          },
          create: {
            branchId: ctx.branch.id,
            name: input.name,
            phone: input.phone,
          },
          update: {},
        })
      ).id;
    },
    ["/customers", "/billing"],
    "Customer selected. Existing preferences are kept; new customers have messages off.",
  );
}
export async function getBillingCustomer(raw: unknown) {
  const ctx = await context(Permission.CUSTOMER);
  return db().customer.findFirst({
    where: {
      id: z.string().max(100).parse(raw),
      branchId: ctx.branch.id,
      active: true,
    },
    select: { id: true, name: true, phone: true },
  });
}
