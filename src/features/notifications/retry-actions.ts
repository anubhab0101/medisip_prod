"use server";
import { z } from "zod";
import type { Job, NotificationLog } from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { id } from "@/lib/validation";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
import { promotionalSendAt } from "./content";

export async function retryMessageAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.MESSAGES);
      const logId = id.parse(text(form, "id"));
      if (form.get("confirmed") !== "on")
        throw new BusinessError(
          "Confirm that you want to retry this failed SMS.",
        );
      if (ctx.branch.demo)
        throw new BusinessError("Messages are disabled in practice mode.");
      return transaction(async (tx) => {
        const [job] = await tx.$queryRaw<
          Job[]
        >`SELECT * FROM Job WHERE id=${logId} FOR UPDATE`;
        const [log] = await tx.$queryRaw<
          NotificationLog[]
        >`SELECT * FROM NotificationLog WHERE id=${logId} AND branchId=${ctx.branch.id} FOR UPDATE`;
        if (!job || !log || log.channel !== "SMS")
          throw new BusinessError("SMS job not found in this shop.");
        const payload = z
          .object({
            branchId: z.string(),
            customerId: z.string(),
            promotional: z.boolean().optional(),
            expiresAt: z.string().datetime().optional(),
          })
          .parse(job.payload);
        if (
          payload.branchId !== ctx.branch.id ||
          payload.customerId !== log.customerId
        )
          throw new BusinessError("SMS job does not match this recipient.");
        if (job.status === "PENDING" && log.status === "QUEUED") return job.id;
        if (
          job.status !== "FAILED" ||
          log.status !== "FAILED" ||
          log.providerId ||
          log.sentAt
        )
          throw new BusinessError(
            "This message cannot be retried safely. Check its delivery status in SMSGate; an uncertain or accepted message must not be resent.",
          );
        const customer = await tx.customer.findFirst({
          where: {
            id: log.customerId,
            branchId: ctx.branch.id,
            active: true,
            consentSms: true,
          },
        });
        if (!customer)
          throw new BusinessError(
            "The customer is inactive or has not agreed to SMS.",
          );
        const runAt = payload.promotional ? promotionalSendAt() : new Date();
        if (payload.expiresAt && new Date(payload.expiresAt) <= runAt)
          throw new BusinessError(
            "This message will expire before it can be sent. Prepare a new announcement if needed.",
          );
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            attempts: 0,
            runAt,
            leaseToken: null,
            leaseUntil: null,
            lastError: null,
          },
        });
        await tx.notificationLog.update({
          where: { id: log.id },
          data: { status: "QUEUED", error: null, scheduledFor: runAt },
        });
        await tx.auditLog.create({
          data: {
            branchId: ctx.branch.id,
            userId: ctx.user.id,
            action: "RETRY_SMS",
            entity: "NotificationLog",
            entityId: log.id,
            before: { status: log.status, attempts: job.attempts },
            after: { status: "QUEUED" },
          },
        });
        return job.id;
      });
    },
    ["/notifications"],
    "Retry queued with the same message ID. Delivery still requires the SMS worker.",
  );
}
