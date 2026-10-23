import "server-only";
import { z } from "zod";
import { Channel, JobStatus, type Job } from "@prisma/client";
import { db } from "@/server/db";
import { claimJob, finishJob } from "./queue";
import { formatMoney } from "@/lib/money";
import { promotionalSendAt } from "@/features/notifications/content";
import { issueReceipt } from "@/features/receipts/issuance";
import {
  sendSms,
  smsStatus,
  ProviderError,
} from "@/features/notifications/smsgate";
const payloadSchema = z.object({
  branchId: z.string(),
  customerId: z.string(),
  saleId: z.string().optional(),
  reminderId: z.string().optional(),
  appointmentId: z.string().optional(),
  body: z.string().optional(),
  templateKey: z.string().max(100).optional(),
  promotional: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
});
async function deliver(job: Job) {
  const payload = payloadSchema.parse(job.payload);
  const [branch, customer] = await Promise.all([
    db().branch.findUnique({ where: { id: payload.branchId } }),
    db().customer.findFirst({
      where: { id: payload.customerId, branchId: payload.branchId },
    }),
  ]);
  if (
    !branch?.active ||
    branch.demo ||
    !customer?.active ||
    !customer.consentSms
  ) {
    await db().notificationLog.updateMany({
      where: { id: job.id },
      data: {
        status: "SKIPPED",
        error: "Shop mode, customer status or consent changed.",
      },
    });
    await finishJob(
      job,
      JobStatus.DONE,
      "Skipped: shop mode, customer status or consent.",
    );
    return;
  }
  if (payload.expiresAt && new Date(payload.expiresAt) <= new Date()) {
    await db().notificationLog.updateMany({
      where: { id: job.id },
      data: {
        status: "SKIPPED",
        error: "Announcement expired before sending.",
      },
    });
    await finishJob(job, JobStatus.DONE, "Skipped: announcement expired.");
    return;
  }
  if (payload.promotional) {
    const due = promotionalSendAt();
    if (due.getTime() > Date.now()) {
      await finishJob(job, JobStatus.PENDING, undefined, due);
      return;
    }
  }
  let body = payload.body;
  if (job.type === "SALE_RECEIPT" && payload.saleId) {
    const sale = await db().sale.findFirst({
      where: {
        id: payload.saleId,
        branchId: branch.id,
        customerId: customer.id,
      },
    });
    if (!sale || sale.status === "VOID") {
      await finishJob(job, JobStatus.DONE, "Skipped: bill unavailable.");
      return;
    }
    body = `${branch.name}: Bill ${sale.invoiceNo}, total ${formatMoney(sale.totalPaise)}. Thank you.`;
    if (process.env.RECEIPT_PUBLIC_URL)
      body += ` Receipt: ${await issueReceipt(branch.id, sale.id, `sms-${job.id}`)}`;
  }
  if (job.type.startsWith("APPOINTMENT_") && payload.appointmentId) {
    const appointment = await db().appointment.findFirst({
      where: {
        id: payload.appointmentId,
        branchId: branch.id,
        customerId: customer.id,
      },
      include: { doctor: true },
    });
    if (!appointment || !["BOOKED", "CONFIRMED"].includes(appointment.status)) {
      await finishJob(
        job,
        JobStatus.DONE,
        "Skipped: appointment no longer active.",
      );
      return;
    }
    const when = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(appointment.startsAt);
    body = `${branch.name}: Appointment with ${appointment.doctor.name} on ${when}. Call ${branch.phone} for changes.`;
  }
  if (job.type === "REFILL_REMINDER") {
    const reminder = await db().refillReminder.findFirst({
      where: {
        id: payload.reminderId ?? "",
        branchId: branch.id,
        customerId: customer.id,
        active: true,
      },
    });
    const medicine =
      reminder &&
      (await db().medicine.findUnique({ where: { id: reminder.medicineId } }));
    const purchased =
      reminder &&
      (await db().saleItem.findMany({
        where: {
          medicineId: reminder.medicineId,
          sale: {
            branchId: branch.id,
            customerId: customer.id,
            status: { notIn: ["VOID", "RETURNED"] },
          },
        },
        select: { quantity: true, returnedQuantity: true },
      }));
    if (
      !reminder ||
      !medicine ||
      !purchased?.some((item) => item.quantity > item.returnedQuantity)
    ) {
      await finishJob(
        job,
        JobStatus.DONE,
        "Skipped: refill reminder cancelled or purchase returned.",
      );
      return;
    }
    body = `${branch.name}: Your requested refill reminder for ${medicine.name}. Contact ${branch.phone} if you need assistance. Follow your prescriber's directions. Reply STOP to opt out.`;
  }
  if (job.type === "CREDIT_REMINDER") {
    const balance = await db().creditEntry.aggregate({
      where: { branchId: branch.id, customerId: customer.id },
      _sum: { amountPaise: true },
    });
    if ((balance._sum.amountPaise ?? 0) <= 0) {
      await finishJob(job, JobStatus.DONE, "Skipped: credit already settled.");
      return;
    }
    body = `${branch.name}: Your outstanding balance is ${formatMoney(balance._sum.amountPaise!)}. Contact ${branch.phone} for payment details. Reply STOP to opt out.`;
  }
  if (!body)
    throw new ProviderError(
      "No message content is available for this job.",
      false,
    );
  const log = await db().notificationLog.upsert({
    where: { id: job.id },
    create: {
      id: job.id,
      branchId: branch.id,
      customerId: customer.id,
      channel: Channel.SMS,
      templateKey: payload.templateKey ?? job.type,
      payload: { body },
      scheduledFor: job.runAt,
    },
    update: {},
  });
  if (
    ["DELIVERED", "SENT", "PENDING", "PROCESSED"].includes(log.status) &&
    log.providerId
  ) {
    await finishJob(job, JobStatus.DONE);
    return;
  }
  // Recover provider outcome before considering another submission after a worker crash.
  if (log.status === "SUBMITTING" || log.status === "UNKNOWN") {
    const known = await smsStatus(job.id);
    if (known) {
      await db().notificationLog.update({
        where: { id: log.id },
        data: { providerId: known.id, status: known.state.toUpperCase() },
      });
      await finishJob(job, JobStatus.DONE);
      return;
    }
    throw new ProviderError(
      "Previous submission has an unknown outcome; review it in SMSGate.",
      false,
      true,
    );
  }
  await db().notificationLog.update({
    where: { id: log.id },
    data: { status: "SUBMITTING" },
  });
  try {
    const result = await sendSms({ id: job.id, phone: customer.phone, body });
    await db().notificationLog.update({
      where: { id: log.id },
      data: {
        status: result.state.toUpperCase(),
        providerId: result.id,
        sentAt: ["Sent", "Delivered"].includes(result.state)
          ? new Date()
          : null,
        error: null,
      },
    });
    await finishJob(job, JobStatus.DONE);
  } catch (error) {
    await db().notificationLog.update({
      where: { id: log.id },
      data: {
        status:
          error instanceof ProviderError && error.uncertain
            ? "UNKNOWN"
            : "FAILED",
        error:
          error instanceof ProviderError
            ? error.message
            : "SMS could not be submitted.",
      },
    });
    throw error;
  }
}
export async function workOnce() {
  const job = await claimJob();
  if (!job) return false;
  try {
    await deliver(job);
  } catch (error) {
    const retry =
      error instanceof ProviderError && error.retryable && job.attempts < 3;
    await finishJob(
      job,
      retry ? JobStatus.PENDING : JobStatus.FAILED,
      error instanceof ProviderError
        ? error.message
        : "Job could not be processed.",
      retry ? new Date(Date.now() + 30000 * 2 ** job.attempts) : undefined,
    );
  }
  return true;
}
export async function pollStatuses() {
  if (process.env.SMS_SEND_ENABLED !== "true") return;
  const logs = await db().notificationLog.findMany({
    where: {
      channel: Channel.SMS,
      providerId: { not: null },
      status: { in: ["PENDING", "PROCESSED", "SENT"] },
      createdAt: { gte: new Date(Date.now() - 48 * 3600000) },
    },
    take: 20,
    orderBy: { createdAt: "asc" },
  });
  for (const log of logs) {
    try {
      const result = await smsStatus(log.providerId!);
      if (result)
        await db().notificationLog.update({
          where: { id: log.id },
          data: {
            status: result.state.toUpperCase(),
            sentAt: ["Sent", "Delivered"].includes(result.state)
              ? (log.sentAt ?? new Date())
              : null,
          },
        });
    } catch {
      /* Retry status polling later; do not resubmit messages. */
    }
  }
}
