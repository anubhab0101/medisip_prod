import "server-only";
import { Channel, JobStatus } from "@prisma/client";
import { z } from "zod";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { signJobPayload } from "@/lib/job-signature";
import { id } from "@/lib/validation";
import { evolutionGoSendingEnabled } from "@/features/notifications/evolution-go";
import { issueReceipt } from "./issuance";

const inputSchema = z.object({
  saleId: id,
  requestId: z.string().uuid(),
  channel: z.enum([Channel.SMS, Channel.WHATSAPP]),
});

export async function queueReceiptDelivery(raw: unknown) {
  const ctx = await context(Permission.BILL);
  const input = inputSchema.parse(raw);
  if (ctx.branch.demo)
    throw new BusinessError("Messages are disabled in practice mode.");
  if (input.channel === Channel.SMS && process.env.SMS_SEND_ENABLED !== "true")
    throw new BusinessError("SMS sending is not enabled yet.", "UNAVAILABLE");
  if (
    input.channel === Channel.WHATSAPP &&
    !evolutionGoSendingEnabled()
  )
    throw new BusinessError("WhatsApp sending is not enabled yet.", "UNAVAILABLE");

  const sale = await db().sale.findFirst({
    where: { id: input.saleId, branchId: ctx.branch.id },
    include: { customer: true },
  });
  if (!sale || sale.status === "VOID")
    throw new BusinessError("Bill not found or no longer available.", "NOT_FOUND");
  const customer = sale.customer;
  if (!customer?.active)
    throw new BusinessError("Add an active customer to this bill first.");
  if (
    input.channel === Channel.SMS
      ? !customer.consentSms
      : !customer.consentWhatsapp
  )
    throw new BusinessError(
      `The customer has not agreed to receipt messages by ${input.channel === Channel.SMS ? "SMS" : "WhatsApp"}.`,
    );

  // The worker creates the same share ID; the receipt link is never stored in the job.
  await issueReceipt(ctx.branch.id, sale.id, input.requestId);
  const type =
    input.channel === Channel.SMS ? "SALE_RECEIPT" : "WHATSAPP_RECEIPT";
  const key = `receipt-share:${sale.id}:${input.channel}:${input.requestId}`;
  const payload = {
    branchId: ctx.branch.id,
    customerId: customer.id,
    saleId: sale.id,
    receiptShareId: input.requestId,
  };
  const signedPayload = { ...payload, _sig: signJobPayload(payload) };

  return transaction(async (tx) => {
    const existing = await tx.job.findUnique({ where: { key } });
    if (existing) {
      const stored = z
        .object({
          branchId: z.string(),
          customerId: z.string(),
          saleId: z.string(),
          receiptShareId: z.string(),
        })
        .parse(existing.payload);
      if (
        stored.branchId !== payload.branchId ||
        stored.customerId !== payload.customerId ||
        stored.saleId !== payload.saleId ||
        stored.receiptShareId !== payload.receiptShareId ||
        existing.type !== type
      )
        throw new BusinessError(
          "This receipt send request was already used. Create a fresh receipt link and try again.",
          "CONFLICT",
        );
      return existing.id;
    }
    const job = await tx.job.create({
      data: {
        key,
        type,
        payload: signedPayload,
        runAt: new Date(),
        status: JobStatus.PENDING,
      },
    });
    await tx.notificationLog.create({
      data: {
        id: job.id,
        branchId: ctx.branch.id,
        customerId: customer.id,
        channel: input.channel,
        templateKey: type,
        payload: { saleId: sale.id },
        status: "QUEUED",
        scheduledFor: job.runAt,
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action:
          input.channel === Channel.SMS
            ? "QUEUE_RECEIPT_SMS"
            : "QUEUE_RECEIPT_WHATSAPP",
        entity: "NotificationLog",
        entityId: job.id,
        after: { channel: input.channel, saleId: sale.id },
      },
    });
    return job.id;
  });
}
