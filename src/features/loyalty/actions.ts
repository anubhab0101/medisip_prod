"use server";
import { z } from "zod";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { id } from "@/lib/validation";
import { saveResult, text } from "@/server/forms";
import { parseMoney } from "@/lib/money";
import type { FormState } from "@/components/shared/action-form";
export async function loyaltyBalance(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const customerId = id.parse(raw);
  const result = await db().loyaltyEntry.aggregate({
    where: { branchId: ctx.branch.id, customerId },
    _sum: { points: true },
  });
  return result._sum.points ?? 0;
}
export async function loyaltySettingsAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.SETTINGS);
      const data = z
        .object({
          loyaltyEnabled: z.boolean(),
          loyaltyEarnPaise: z.number().int().min(100).max(100000000),
          loyaltyRedeemPaise: z.number().int().min(1).max(100000),
        })
        .parse({
          loyaltyEnabled: form.get("enabled") === "on",
          loyaltyEarnPaise: parseMoney(text(form, "earn")),
          loyaltyRedeemPaise: parseMoney(text(form, "redeem")),
        });
      return transaction(async (tx) => {
        await tx.branch.update({ where: { id: ctx.branch.id }, data });
        await tx.auditLog.create({
          data: {
            branchId: ctx.branch.id,
            userId: ctx.user.id,
            action: "LOYALTY_SETTINGS",
            entity: "Branch",
            entityId: ctx.branch.id,
            after: data,
          },
        });
      });
    },
    ["/settings", "/billing"],
    "Loyalty settings saved.",
  );
}
