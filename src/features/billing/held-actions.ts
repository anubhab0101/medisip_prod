"use server";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { saveResult } from "@/server/forms";
import { holdBill, readHeldBill, discardHeldBill } from "./held-service";
export async function holdBillAction(raw: unknown) {
  return saveResult(
    () => holdBill(raw),
    ["/billing"],
    "Bill held. Stock is checked when you resume.",
  );
}
export async function listHeldBills() {
  const ctx = await context(Permission.BILL);
  return db().heldBill.findMany({
    where: { branchId: ctx.branch.id, userId: ctx.user.id },
    select: { id: true, label: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}
export async function resumeHeldAction(id: string) {
  return readHeldBill(id);
}
export async function discardHeldAction(id: string) {
  return saveResult(
    () => discardHeldBill({ id, confirmed: true }),
    ["/billing"],
    "Held bill discarded.",
  );
}
export async function completedDraft(operationId: string) {
  const ctx = await context(Permission.BILL);
  const sale = await db().sale.findFirst({
    where: { operationId, branchId: ctx.branch.id, userId: ctx.user.id },
    select: { id: true },
  });
  return sale?.id ?? null;
}
