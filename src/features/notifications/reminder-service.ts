import "server-only";
import { z } from "zod";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { id, operationId } from "@/lib/validation";
import { BusinessError } from "@/lib/errors";
import { promotionalSendAt } from "./content";
export async function scheduleReminder(raw: unknown) {
  const ctx = await context(Permission.MESSAGES);
  const input = z
    .object({
      operationId,
      customerId: id,
      medicineId: z.string().max(100),
      kind: z.enum(["REFILL", "CREDIT"]),
      when: z.string().datetime(),
    })
    .parse(raw);
  const runAt = promotionalSendAt(new Date(input.when));
  if (runAt <= new Date() || runAt.getTime() > Date.now() + 366 * 86400000)
    throw new BusinessError("Choose a future reminder within one year.");
  return transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: {
        id: input.customerId,
        branchId: ctx.branch.id,
        active: true,
        consentSms: true,
      },
    });
    if (!customer)
      throw new BusinessError("Choose a customer who agreed to SMS reminders.");
    const previous = await tx.job.findUnique({
      where: { key: `reminder:${input.operationId}` },
    });
    if (previous) {
      const data = previous.payload as {
        branchId?: string;
        customerId?: string;
      };
      if (data.branchId !== ctx.branch.id || data.customerId !== customer.id)
        throw new BusinessError(
          "Reminder request does not match this customer.",
        );
      return previous.id;
    }
    if (input.kind === "REFILL") {
      const purchase = await tx.saleItem.findFirst({
        where: {
          medicineId: input.medicineId,
          sale: {
            branchId: ctx.branch.id,
            customerId: customer.id,
            status: { notIn: ["VOID", "RETURNED"] },
          },
        },
      });
      if (!purchase)
        throw new BusinessError(
          "Choose a medicine from this customer’s purchase history.",
        );
      await tx.refillReminder.create({
        data: {
          id: input.operationId,
          branchId: ctx.branch.id,
          customerId: customer.id,
          medicineId: input.medicineId,
          dueAt: runAt,
        },
      });
    } else {
      const balance = await tx.creditEntry.aggregate({
        where: { branchId: ctx.branch.id, customerId: customer.id },
        _sum: { amountPaise: true },
      });
      if ((balance._sum.amountPaise ?? 0) <= 0)
        throw new BusinessError("This customer has no outstanding credit.");
    }
    const job = await tx.job.create({
      data: {
        key: `reminder:${input.operationId}`,
        type: input.kind === "REFILL" ? "REFILL_REMINDER" : "CREDIT_REMINDER",
        payload: {
          branchId: ctx.branch.id,
          customerId: customer.id,
          reminderId: input.operationId,
          promotional: true,
        },
        runAt,
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "SCHEDULE_REMINDER",
        entity: "Job",
        entityId: job.id,
        after: {
          kind: input.kind,
          customerId: customer.id,
          when: runAt.toISOString(),
        },
      },
    });
    return job.id;
  });
}

export async function cancelReminder(raw: unknown) {
  const ctx = await context(Permission.MESSAGES);
  const jobId = id.parse(raw);
  return transaction(async (tx) => {
    const [job] = await tx.$queryRaw<
      { id: string; status: string; payload: unknown; type: string }[]
    >`SELECT id,status,payload,type FROM Job WHERE id=${jobId} FOR UPDATE`;
    const payload = job?.payload as
      { branchId?: string; reminderId?: string } | undefined;
    if (
      !job ||
      payload?.branchId !== ctx.branch.id ||
      !["REFILL_REMINDER", "CREDIT_REMINDER"].includes(job.type)
    )
      throw new BusinessError("Reminder not found.");
    if (job.status !== "PENDING")
      throw new BusinessError(
        "Only pending reminders can be cancelled. This reminder may already be processing.",
      );
    await tx.job.update({
      where: { id: job.id },
      data: { status: "DONE", lastError: "Cancelled by staff." },
    });
    if (payload.reminderId)
      await tx.refillReminder.updateMany({
        where: { id: payload.reminderId, branchId: ctx.branch.id },
        data: { active: false },
      });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "CANCEL_REMINDER",
        entity: "Job",
        entityId: job.id,
      },
    });
  });
}
