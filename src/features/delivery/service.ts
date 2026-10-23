import "server-only";
import { z } from "zod";
import type { Delivery, Sale } from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { id, phone } from "@/lib/validation";
export const deliveryStatuses = [
  "PENDING",
  "PACKED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;
export async function createDelivery(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const input = z
    .object({
      saleId: id,
      address: z.string().trim().min(5).max(1000),
      phone,
      assignedTo: z.string().trim().max(150),
      notes: z.string().trim().max(1000),
    })
    .parse(raw);
  return transaction(async (tx) => {
    const [sale] = await tx.$queryRaw<
      Sale[]
    >`SELECT * FROM Sale WHERE id=${input.saleId} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!sale || ["VOID", "RETURNED"].includes(sale.status))
      throw new BusinessError("Choose an active bill from this shop.");
    const existing = await tx.delivery.findUnique({
      where: { saleId: sale.id },
    });
    if (existing) return existing.id;
    const delivery = await tx.delivery.create({
      data: { ...input, branchId: ctx.branch.id },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "CREATE_DELIVERY",
        entity: "Delivery",
        entityId: delivery.id,
        after: { saleId: sale.id },
      },
    });
    return delivery.id;
  });
}
export async function updateDelivery(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const input = z
    .object({
      id,
      status: z.enum(deliveryStatuses),
      assignedTo: z.string().trim().max(150),
      notes: z.string().trim().max(1000),
      confirmed: z.boolean(),
    })
    .parse(raw);
  return transaction(async (tx) => {
    const reference = await tx.delivery.findFirst({
      where: { id: input.id, branchId: ctx.branch.id },
      select: { saleId: true },
    });
    if (!reference) throw new BusinessError("Delivery not found in this shop.");
    // Match billing's sale-first lock order; a concurrent return must finish
    // before an undelivered order can move forward.
    const [sale] = await tx.$queryRaw<
      Sale[]
    >`SELECT * FROM Sale WHERE id=${reference.saleId} AND branchId=${ctx.branch.id} FOR UPDATE`;
    const [delivery] = await tx.$queryRaw<
      Delivery[]
    >`SELECT * FROM Delivery WHERE id=${input.id} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!delivery) throw new BusinessError("Delivery not found in this shop.");
    if (
      input.status !== delivery.status &&
      input.status !== "CANCELLED" &&
      (!sale || ["VOID", "RETURNED"].includes(sale.status))
    )
      throw new BusinessError(
        "This bill was returned or voided. Cancel its delivery.",
      );
    const allowed: Record<string, string[]> = {
      PENDING: ["PACKED", "CANCELLED"],
      PACKED: ["OUT_FOR_DELIVERY", "CANCELLED"],
      OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
      DELIVERED: [],
      CANCELLED: [],
    };
    if (
      input.status !== delivery.status &&
      !allowed[delivery.status]?.includes(input.status)
    )
      throw new BusinessError(
        "Follow the delivery steps in order. Completed deliveries cannot be reopened.",
      );
    if (["DELIVERED", "CANCELLED"].includes(input.status) && !input.confirmed)
      throw new BusinessError(
        "Confirm the final delivery status before saving.",
      );
    await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        status: input.status,
        assignedTo: input.assignedTo,
        notes: input.notes,
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "UPDATE_DELIVERY",
        entity: "Delivery",
        entityId: delivery.id,
        before: { status: delivery.status },
        after: { status: input.status, assignedTo: input.assignedTo },
      },
    });
    return delivery.id;
  });
}
