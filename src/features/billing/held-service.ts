import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { id } from "@/lib/validation";
import { draftSchema } from "./draft";
export async function holdBill(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const { label, draft } = z
    .object({ label: z.string().trim().min(1).max(100), draft: draftSchema })
    .parse(raw);
  const previousSale = await db().sale.findUnique({
    where: { operationId: draft.operationId },
  });
  if (previousSale)
    throw new BusinessError(
      "This bill has already been saved. Open it from Bills.",
    );
  const existing = await db().heldBill.findUnique({
    where: { id: draft.operationId },
  });
  if (
    existing &&
    (existing.branchId !== ctx.branch.id || existing.userId !== ctx.user.id)
  )
    throw new BusinessError("Held bill not found.");
  const where = {
    id: draft.operationId,
    branchId: ctx.branch.id,
    userId: ctx.user.id,
  };
  if (existing)
    await db().heldBill.updateMany({ where, data: { label, payload: draft } });
  else {
    try {
      await db().heldBill.create({ data: { ...where, label, payload: draft } });
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ))
        throw error;
      const updated = await db().heldBill.updateMany({
        where,
        data: { label, payload: draft },
      });
      if (!updated.count) throw new BusinessError("Held bill not found.");
    }
  }
  return draft.operationId;
}
export async function readHeldBill(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const held = await db().heldBill.findFirst({
    where: { id: id.parse(raw), branchId: ctx.branch.id, userId: ctx.user.id },
  });
  if (!held)
    throw new BusinessError(
      "Held bill not found. It may already have been completed.",
    );
  return draftSchema.parse(held.payload);
}
export async function discardHeldBill(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const input = z.object({ id, confirmed: z.literal(true) }).parse(raw);
  await db().heldBill.deleteMany({
    where: { id: input.id, branchId: ctx.branch.id, userId: ctx.user.id },
  });
}
