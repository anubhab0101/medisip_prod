import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Channel, Prisma, ProviderKind, type Broadcast, type Customer } from "@prisma/client";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { id } from "@/lib/validation";
import { BusinessError } from "@/lib/errors";
import { manualMessage, promotionalSendAt } from "./content";
import { evolutionGoSendingEnabled } from "./evolution-go";
import {
  broadcastSchema,
  broadcastBody,
  eligibleCustomer,
} from "./broadcast-content";

export async function previewBroadcast(raw: unknown) {
  const ctx = await context(Permission.MESSAGES);
  const input = broadcastSchema.parse(raw);
  if (input.audience === "SELECTED" && !input.customerIds.length)
    throw new BusinessError("Select at least one customer.", "VALIDATION_ERROR");
  const scheduledFor = promotionalSendAt();
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt <= scheduledFor)
    throw new BusinessError(
      "The visit must end after the next permitted sending time (8 AM–9 PM).",
      "VALIDATION_ERROR",
    );
  return transaction(async (tx) => {
    const previous = await tx.broadcast.findUnique({
      where: { operationId: input.operationId },
    });
    if (previous) {
      if (previous.branchId !== ctx.branch.id)
        throw new BusinessError("Broadcast not found in this shop.", "NOT_FOUND");
      return previous.id;
    }
    const customers = await tx.customer.findMany({
      where: {
        branchId: ctx.branch.id,
        active: true,
        ...(input.audience === "SELECTED"
          ? { id: { in: input.customerIds } }
          : {}),
      },
      take: 10001,
    });
    if (customers.length > 10000)
      throw new BusinessError(
        "Choose up to 10,000 customers for one broadcast.",
        "VALIDATION_ERROR",
      );
    const eligible = customers.filter((c) =>
      eligibleCustomer(c, input.channel),
    );
    if (!eligible.length)
      throw new BusinessError(
        "No selected customers have consent and a valid contact for this channel.",
        "VALIDATION_ERROR",
      );
    const broadcast = await tx.broadcast.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        operationId: input.operationId,
        title: input.title,
        body: broadcastBody(ctx.branch.name, input.body),
        channel: input.channel,
        recipientCount: eligible.length,
        skippedCount: customers.length - eligible.length,
        scheduledFor,
        expiresAt,
      },
    });
    for (let start = 0; start < eligible.length; start += 500) {
      await tx.notificationLog.createMany({
        data: eligible.slice(start, start + 500).map((c) => ({
          id: randomUUID(),
          branchId: ctx.branch.id,
          broadcastId: broadcast.id,
          customerId: c.id,
          channel: input.channel,
          templateKey: "BROADCAST",
          payload: { body: broadcast.body },
          status: "DRAFT",
          scheduledFor,
        })),
      });
    }
    return broadcast.id;
  });
}

export async function confirmBroadcast(raw: unknown) {
  const ctx = await context(Permission.MESSAGES);
  const input = z.object({ id, confirmed: z.literal(true) }).parse(raw);
  if (ctx.branch.demo)
    throw new BusinessError(
      "You can preview broadcasts in practice mode. Sending is disabled.",
    );
  return transaction(async (tx) => {
    const [broadcast] = await tx.$queryRaw<
      Broadcast[]
    >`SELECT * FROM Broadcast WHERE id=${input.id} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!broadcast)
      throw new BusinessError("Broadcast not found in this shop.");
    if (broadcast.status !== "DRAFT") return broadcast.id;
    const integration = broadcast.channel === Channel.SMS
      ? await tx.providerIntegration.findUnique({ where: { branchId_provider: { branchId: ctx.branch.id, provider: ProviderKind.SMSGATE } }, select: { enabled: true } })
      : broadcast.channel === Channel.WHATSAPP
        ? await tx.providerIntegration.findUnique({ where: { branchId_provider: { branchId: ctx.branch.id, provider: ProviderKind.EVOLUTION_GO } }, select: { enabled: true } })
        : null;
    if (broadcast.channel === Channel.SMS && (process.env.SMS_SEND_ENABLED !== "true" || !integration?.enabled))
      throw new BusinessError(
        "SMS sending is not enabled for this shop. Ask the platform admin to connect and test SMSGate.",
      );
    const runAt = promotionalSendAt();
    if (broadcast.expiresAt && broadcast.expiresAt <= runAt)
      throw new BusinessError(
        "This announcement has expired. Create a new broadcast.",
      );
    const logs = await tx.notificationLog.findMany({
      where: { broadcastId: broadcast.id, branchId: ctx.branch.id },
    });
    const customers = await tx.$queryRaw<Customer[]>(
      Prisma.sql`SELECT * FROM Customer WHERE branchId=${ctx.branch.id} AND id IN (${Prisma.join(logs.map((l) => l.customerId))}) ORDER BY id FOR UPDATE`,
    );
    const byId = new Map(customers.map((c) => [c.id, c]));
    const eligible = logs.filter((l) => {
      const c = byId.get(l.customerId);
      return c && eligibleCustomer(c, broadcast.channel);
    });
    const eligibleIds = new Set(eligible.map((l) => l.id));
    const skippedIds = logs
      .filter((l) => !eligibleIds.has(l.id))
      .map((l) => l.id);
    if (skippedIds.length)
      await tx.notificationLog.updateMany({
        where: { id: { in: skippedIds } },
        data: {
          status: "SKIPPED",
          error: "Consent or contact changed since preview.",
        },
      });
    if (!eligible.length)
      throw new BusinessError(
        "No recipients remain eligible. Check customer consent and create a new preview.",
      );
    const automatic =
      broadcast.channel === Channel.SMS ||
      (broadcast.channel === Channel.WHATSAPP && evolutionGoSendingEnabled() && Boolean(integration?.enabled));
    const status = automatic ? "QUEUED" : "READY_FOR_MANUAL_SEND";
    await tx.notificationLog.updateMany({
      where: { id: { in: [...eligibleIds] } },
      data: { status, scheduledFor: runAt },
    });
    if (automatic) {
      const whatsapp = broadcast.channel === Channel.WHATSAPP;
      for (let start = 0; start < eligible.length; start += 500) {
        await tx.job.createMany({
          data: eligible.slice(start, start + 500).map((l) => ({
            id: l.id,
            key: `${whatsapp ? "whatsapp" : "broadcast"}:${l.id}`,
            type: whatsapp ? "CUSTOM_WHATSAPP" : "CUSTOM_SMS",
            payload: {
              branchId: ctx.branch.id,
              customerId: l.customerId,
              body: broadcast.body,
              promotional: true,
              ...(broadcast.expiresAt
                ? { expiresAt: broadcast.expiresAt.toISOString() }
                : {}),
            },
            runAt,
          })),
        });
      }
    }
    await tx.broadcast.update({
      where: { id: broadcast.id },
      data: {
        status,
        scheduledFor: runAt,
        recipientCount: eligible.length,
        skippedCount: { increment: skippedIds.length },
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "CONFIRM_BROADCAST",
        entity: "Broadcast",
        entityId: broadcast.id,
        after: { count: eligible.length, channel: broadcast.channel },
      },
    });
    return broadcast.id;
  });
}

export async function openBroadcastMessage(raw: unknown) {
  const ctx = await context(Permission.MESSAGES);
  const logId = id.parse(raw);
  if (ctx.branch.demo)
    throw new BusinessError("Sending is disabled in practice mode.");
  if (promotionalSendAt().getTime() > Date.now())
    throw new BusinessError("Open announcements between 8 AM and 9 PM.");
  const log = await db().notificationLog.findFirst({
    where: {
      id: logId,
      branchId: ctx.branch.id,
      broadcastId: { not: null },
      status: { in: ["READY_FOR_MANUAL_SEND", "PREPARED_FOR_MANUAL_SEND"] },
      channel: { not: Channel.SMS },
    },
  });
  if (!log)
    throw new BusinessError(
      "Message not available. Confirm the broadcast first.",
    );
  const [broadcast, customer] = await Promise.all([
    db().broadcast.findFirst({
      where: { id: log.broadcastId!, branchId: ctx.branch.id },
    }),
    db().customer.findFirst({
      where: { id: log.customerId, branchId: ctx.branch.id },
    }),
  ]);
  if (!broadcast || (broadcast.expiresAt && broadcast.expiresAt <= new Date()))
    throw new BusinessError("This announcement has expired.");
  if (!customer || !eligibleCustomer(customer, log.channel))
    throw new BusinessError(
      "This customer no longer has consent or a valid contact.",
    );
  const channel =
    log.channel === Channel.EMAIL ? Channel.EMAIL : Channel.WHATSAPP;
  const url = manualMessage(
    channel,
    channel === Channel.EMAIL ? customer.email : customer.phone,
    broadcast.body,
    broadcast.title,
  );
  await db().notificationLog.update({
    where: { id: log.id },
    data: { status: "PREPARED_FOR_MANUAL_SEND" },
  });
  return url;
}
