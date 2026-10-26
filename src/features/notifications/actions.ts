"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Channel } from "@prisma/client";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError, friendlyError } from "@/lib/errors";
import { id, operationId, phone } from "@/lib/validation";
import { saveResult, text } from "@/server/forms";
import { manualMessage, promotionalSendAt } from "./content";
import type { FormState } from "@/components/shared/action-form";
import { fillTemplate } from "./template-content";
import { evolutionGoSendingEnabled } from "./evolution-go";
export async function prepareMessage(raw: unknown) {
  const ctx = await context(Permission.MESSAGES);
  const input = z
    .object({
      customerId: id,
      channel: z.enum([Channel.SMS, Channel.WHATSAPP, Channel.EMAIL]),
      body: z.string().trim().min(1).max(1200),
      promotional: z.boolean(),
      operationId,
      templateId: z.string().max(100).optional(),
      testMode: z.boolean().default(false),
      ownPhone: z.string().max(30).optional(),
      ownRecipientConfirmed: z.boolean().default(false),
      variables: z
        .object({
          date: z.string().max(150).optional(),
          time: z.string().max(150).optional(),
          doctor: z.string().max(150).optional(),
          amount: z.string().max(150).optional(),
        })
        .optional(),
    })
    .parse(raw);
  const customer = await db().customer.findFirst({
    where: { id: input.customerId, branchId: ctx.branch.id, active: true },
  });
  if (!customer) throw new BusinessError("Customer not found.");
  if (input.testMode) {
    if (!input.templateId || !input.ownRecipientConfirmed)
      throw new BusinessError(
        "Choose a saved template and confirm this is your own contact record.",
      );
    if (input.channel === Channel.EMAIL) {
      if (
        !customer.email ||
        customer.email.toLowerCase() !== ctx.user.email.toLowerCase()
      )
        throw new BusinessError(
          "The test email must match your staff sign-in email.",
        );
    } else {
      const own = phone.safeParse(input.ownPhone),
        saved = phone.safeParse(customer.phone);
      if (!own.success || !saved.success || own.data !== saved.data)
        throw new BusinessError(
          "Enter your own number and select the customer record with that same number.",
        );
    }
  }
  let templateKey = "MANUAL";
  if (input.templateId) {
    const template = await db().notificationTemplate.findFirst({
      where: {
        id: input.templateId,
        branchId: ctx.branch.id,
        active: true,
        channel: input.channel,
      },
    });
    if (!template)
      throw new BusinessError(
        "This template is unavailable. Reload the message form.",
      );
    try {
      input.body = z
        .string()
        .max(1200)
        .parse(
          fillTemplate(template.body, {
            ...input.variables,
            name: customer.name,
            shop: ctx.branch.name,
          }),
        );
    } catch {
      throw new BusinessError(
        "Fill every template variable and keep the message under 1,200 characters.",
      );
    }
    input.promotional = template.promotional || input.promotional;
    templateKey = template.key;
  }
  if (ctx.branch.demo)
    throw new BusinessError("Messages are disabled in practice mode.");
  const consent =
    input.channel === Channel.SMS
      ? customer.consentSms
      : input.channel === Channel.WHATSAPP
        ? customer.consentWhatsapp
        : customer.consentEmail;
  if (!consent)
    throw new BusinessError(
      "The customer has not agreed to messages on this channel.",
    );
  const body = `${ctx.branch.name}: ${input.testMode ? "[TEST] " : ""}${input.body}${input.promotional ? " Reply STOP or contact the shop to opt out." : ""}`;
  const sendWhatsAppAutomatically =
    input.channel === Channel.WHATSAPP && evolutionGoSendingEnabled();
  if (input.channel !== Channel.SMS && !sendWhatsAppAutomatically) {
    if (input.promotional && promotionalSendAt().getTime() > Date.now())
      throw new BusinessError(
        "Promotional messages can be sent between 8 AM and 9 PM.",
      );
    const url = manualMessage(
      input.channel,
      input.channel === Channel.EMAIL ? customer.email : customer.phone,
      body,
    );
    await db().notificationLog.create({
      data: {
        branchId: ctx.branch.id,
        customerId: customer.id,
        channel: input.channel,
        templateKey,
        payload: { body },
        status: "PREPARED_FOR_MANUAL_SEND",
        scheduledFor: new Date(),
      },
    });
    return { url, queued: false };
  }
  const runAt = input.promotional ? promotionalSendAt() : new Date();
  const testExpiry = new Date(Date.now() + 15 * 60000);
  if (input.testMode && runAt >= testExpiry)
    throw new BusinessError(
      "Test promotional SMS templates between 8 AM and 9 PM.",
    );
  const whatsapp = input.channel === Channel.WHATSAPP;
  await transaction(async (tx) => {
    const key = `${whatsapp ? "manual-whatsapp" : "manual"}:${input.operationId}`;
    const queued = await tx.job.upsert({
      where: { key },
      create: {
        key,
        type: whatsapp ? "CUSTOM_WHATSAPP" : "CUSTOM_SMS",
        payload: {
          branchId: ctx.branch.id,
          customerId: customer.id,
          body,
          promotional: input.promotional,
          templateKey,
          ...(input.testMode ? { expiresAt: testExpiry.toISOString() } : {}),
        },
        runAt,
      },
      update: {},
    });
    const prior = z
      .object({
        branchId: z.string(),
        customerId: z.string(),
        body: z.string(),
        promotional: z.boolean(),
      })
      .parse(queued.payload);
    if (
      prior.branchId !== ctx.branch.id ||
      prior.customerId !== customer.id ||
      prior.body !== body ||
      prior.promotional !== input.promotional
    )
      throw new BusinessError(
        "This submission already prepared a different message. Reload before preparing a new message.",
      );
    if (whatsapp)
      await tx.notificationLog.upsert({
        where: { id: queued.id },
        create: {
          id: queued.id,
          branchId: ctx.branch.id,
          customerId: customer.id,
          channel: Channel.WHATSAPP,
          templateKey,
          payload: { body },
          status: "QUEUED",
          scheduledFor: runAt,
        },
        update: {},
      });
  });
  return { url: "", queued: true };
}
export async function prepareMessageForForm(raw: unknown) {
  try {
    const result = await prepareMessage(raw);
    revalidatePath("/notifications");
    return { ...result, error: "" };
  } catch (error) {
    return {
      url: "",
      queued: false,
      error:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Check the message fields.")
          : friendlyError(error),
    };
  }
}
export async function messageAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const result = await prepareMessage({
        customerId: text(form, "customerId"),
        channel: text(form, "channel"),
        body: text(form, "body"),
        promotional: form.get("promotional") === "on",
        operationId: text(form, "operationId"),
      });
      return result.url;
    },
    ["/notifications"],
    "Message prepared. SMS is queued; manual channels require you to send the message.",
  );
}
