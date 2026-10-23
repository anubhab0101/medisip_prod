import "server-only";
import { z } from "zod";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { id } from "@/lib/validation";
import { issueReceipt } from "./issuance";
export { issueReceipt } from "./issuance";
export async function shareReceipt(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const input = z
    .object({ saleId: id, requestId: z.string().uuid() })
    .parse(raw);
  const url = await issueReceipt(ctx.branch.id, input.saleId, input.requestId);
  await db().auditLog.create({
    data: {
      branchId: ctx.branch.id,
      userId: ctx.user.id,
      action: "SHARE_RECEIPT",
      entity: "Sale",
      entityId: input.saleId,
    },
  });
  return url;
}
export async function revokeReceipts(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const saleId = id.parse(raw);
  await db().receiptShare.updateMany({
    where: { saleId, branchId: ctx.branch.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await db().auditLog.create({
    data: {
      branchId: ctx.branch.id,
      userId: ctx.user.id,
      action: "REVOKE_RECEIPTS",
      entity: "Sale",
      entityId: saleId,
    },
  });
}
