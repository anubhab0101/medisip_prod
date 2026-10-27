"use server";
import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { ProviderKind, Role } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPlatformAdmin } from "@/lib/platform-admin";
import { db } from "@/server/db";
import { encryptProviderConfig, decryptProviderConfig, validateProviderConfig } from "@/lib/provider-integrations";
import { sendSms, type SmsConfig } from "@/features/notifications/smsgate";
import { sendEvolutionGoText, type EvolutionConfig } from "@/features/notifications/evolution-go";

const shopIdSchema = z.string().min(1).max(191);
const providerSchema = z.nativeEnum(ProviderKind);

function audit(tx: Prisma.TransactionClient, data: { branchId: string; userId: string; action: string; entity: string; entityId: string; after: object }) {
  return tx.auditLog.create({ data: { ...data, after: data.after } });
}

export async function createPlatformShop(form: FormData) {
  const admin = await assertPlatformAdmin();
  let input;
  try {
    input = z.object({
      name: z.string().trim().min(2).max(191),
      address: z.string().trim().min(5).max(1000),
      phone: z.string().trim().min(10).max(20),
      ownerName: z.string().trim().max(191).optional(),
      ownerEmail: z.string().trim().email().max(191).transform((s) => s.toLowerCase()),
      initialPassword: z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.string().min(12).max(72).refine((s) => Buffer.byteLength(s, "utf8") <= 72).optional()),
    }).parse(Object.fromEntries(form.entries()));
  } catch {
    redirect("/platform?error=invalid_details");
  }
  const result = await db().$transaction(async (tx) => {
    const existingOwner = await tx.user.findUnique({ where: { email: input.ownerEmail }, select: { id: true, active: true } });
    if (existingOwner && !existingOwner.active) return { error: "owner_inactive" as const };
    if (!existingOwner && (!input.initialPassword || !input.ownerName || input.ownerName.length < 2))
      return { error: "owner_details" as const };
    const passwordHash = existingOwner ? undefined : await hash(input.initialPassword!, 12);
    const created = await tx.branch.create({ data: {
      name: input.name, address: input.address, phone: input.phone,
      memberships: { create: existingOwner
        ? { role: Role.OWNER, user: { connect: { id: existingOwner.id } } }
        : { role: Role.OWNER, user: { create: {
            name: input.ownerName!, email: input.ownerEmail, passwordHash: passwordHash!, mustChangePassword: true,
          } } } },
    } });
    await audit(tx, { branchId: created.id, userId: admin.id, action: "PLATFORM_SHOP_CREATED", entity: "Branch", entityId: created.id, after: { name: created.name, ownerEmail: input.ownerEmail } });
    return { branch: created, linked: Boolean(existingOwner), error: null };
  }).catch((error: unknown) => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("Platform shop creation failed", { code });
    redirect(`/platform?error=${code === "P2002" ? "owner_conflict" : "create_failed"}`);
  });
  if ("error" in result && result.error) redirect(`/platform?error=${result.error}`);
  revalidatePath("/platform");
  redirect(`/platform/shops/${result.branch.id}?${result.linked ? "linked=1" : "created=1"}`);
}

export async function setPlatformShopStatus(form: FormData) {
  const admin = await assertPlatformAdmin();
  const input = z.object({ branchId: shopIdSchema, active: z.enum(["true", "false"]) }).parse(Object.fromEntries(form.entries()));
  await db().$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({ where: { id: input.branchId }, select: { id: true, active: true, name: true } });
    if (!branch) throw new Error("Shop not found.");
    const active = input.active === "true";
    await tx.branch.update({ where: { id: branch.id }, data: { active } });
    await audit(tx, { branchId: branch.id, userId: admin.id, action: active ? "PLATFORM_SHOP_ACTIVATED" : "PLATFORM_SHOP_SUSPENDED", entity: "Branch", entityId: branch.id, after: { active } });
  });
  revalidatePath("/platform"); revalidatePath(`/platform/shops/${input.branchId}`);
}

export async function resetPlatformUserPassword(form: FormData) {
  const admin = await assertPlatformAdmin();
  const input = z.object({ branchId: shopIdSchema, userId: shopIdSchema })
    .parse(Object.fromEntries(form.entries()));
  const where = { userId_branchId: { userId: input.userId, branchId: input.branchId } };
  const membership = await db().membership.findUnique({
    where,
    select: { role: true, user: { select: { id: true, active: true } } },
  });
  if (!membership?.user.active) throw new Error("This shop user is unavailable or inactive.");

  const temporaryPassword = randomBytes(18).toString("base64url");
  const passwordHash = await hash(temporaryPassword, 12);
  await db().$transaction(async (tx) => {
    const currentMembership = await tx.membership.findUnique({
      where,
      select: { role: true, user: { select: { active: true } } },
    });
    if (!currentMembership?.user.active) throw new Error("This shop user is unavailable or inactive.");
    await tx.user.update({
      where: { id: input.userId },
      data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } },
    });
    await audit(tx, {
      branchId: input.branchId,
      userId: admin.id,
      action: "PLATFORM_USER_PASSWORD_RESET",
      entity: "User",
      entityId: input.userId,
      after: { role: currentMembership.role, mustChangePassword: true, activeSessionsRevoked: true },
    });
  });
  revalidatePath("/platform");
  revalidatePath(`/platform/shops/${input.branchId}`);
  return temporaryPassword;
}

export async function deleteEmptyPlatformShop(form: FormData) {
  const admin = await assertPlatformAdmin();
  const input = z.object({
    branchId: shopIdSchema,
    confirmation: z.string().trim().min(2).max(191),
  }).parse(Object.fromEntries(form.entries()));

  const result = await db().$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({
      where: { id: input.branchId },
      select: { id: true, name: true },
    });
    if (!branch) return { error: "shop_missing" as const };
    if (input.confirmation !== branch.name) return { error: "shop_name_mismatch" as const };

    // Preserve all shop operations and externally shared booking links. Only
    // onboarding-only shops with no operational records can be permanently removed.
    const [branchMedicines, batches, suppliers, purchases, movements, customers, invoices,
      sales, credits, doctors, appointments, templates, notifications, broadcasts,
      heldBills, receipts, reminders, orders, loyalty, devices, reservations,
      transfersFrom, transfersTo, deliveries, bookingLinks] = await Promise.all([
      tx.branchMedicine.count({ where: { branchId: branch.id } }),
      tx.batch.count({ where: { branchId: branch.id } }),
      tx.supplier.count({ where: { branchId: branch.id } }),
      tx.purchase.count({ where: { branchId: branch.id } }),
      tx.stockMovement.count({ where: { branchId: branch.id } }),
      tx.customer.count({ where: { branchId: branch.id } }),
      tx.invoiceCounter.count({ where: { branchId: branch.id } }),
      tx.sale.count({ where: { branchId: branch.id } }),
      tx.creditEntry.count({ where: { branchId: branch.id } }),
      tx.doctor.count({ where: { branchId: branch.id } }),
      tx.appointment.count({ where: { branchId: branch.id } }),
      tx.notificationTemplate.count({ where: { branchId: branch.id } }),
      tx.notificationLog.count({ where: { branchId: branch.id } }),
      tx.broadcast.count({ where: { branchId: branch.id } }),
      tx.heldBill.count({ where: { branchId: branch.id } }),
      tx.receiptShare.count({ where: { branchId: branch.id } }),
      tx.refillReminder.count({ where: { branchId: branch.id } }),
      tx.purchaseOrder.count({ where: { branchId: branch.id } }),
      tx.loyaltyEntry.count({ where: { branchId: branch.id } }),
      tx.device.count({ where: { branchId: branch.id } }),
      tx.stockReservation.count({ where: { branchId: branch.id } }),
      tx.transfer.count({ where: { fromBranchId: branch.id } }),
      tx.transfer.count({ where: { toBranchId: branch.id } }),
      tx.delivery.count({ where: { branchId: branch.id } }),
      tx.publicBookingLink.count({ where: { branchId: branch.id } }),
    ]);
    if ([branchMedicines, batches, suppliers, purchases, movements, customers, invoices,
      sales, credits, doctors, appointments, templates, notifications, broadcasts,
      heldBills, receipts, reminders, orders, loyalty, devices, reservations,
      transfersFrom, transfersTo, deliveries, bookingLinks].some((count) => count > 0)) {
      return { error: "shop_has_data" as const };
    }

    await audit(tx, {
      branchId: branch.id,
      userId: admin.id,
      action: "PLATFORM_EMPTY_SHOP_DELETED",
      entity: "Branch",
      entityId: branch.id,
      after: { name: branch.name, deletedBy: admin.email },
    });
    await tx.providerIntegration.deleteMany({ where: { branchId: branch.id } });
    await tx.membership.deleteMany({ where: { branchId: branch.id } });
    await tx.branch.delete({ where: { id: branch.id } });
    return { error: null as null, branchName: branch.name };
  }).catch((error: unknown) => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("Platform empty-shop deletion failed", { code });
    return { error: "shop_delete_failed" as const };
  });

  if (result.error) redirect(`/platform?error=${result.error}`);
  revalidatePath("/platform");
  redirect(`/platform?deleted=${encodeURIComponent(result.branchName)}`);
}

export async function saveProviderConfig(form: FormData) {
  const admin = await assertPlatformAdmin();
  const input = z.object({ branchId: shopIdSchema, provider: providerSchema, enabled: z.enum(["true", "false"]).optional() }).parse(Object.fromEntries(form.entries()));
  const existing = await db().providerIntegration.findUnique({ where: { branchId_provider: { branchId: input.branchId, provider: input.provider } }, select: { enabled: true } });
  const raw = input.provider === ProviderKind.SMSGATE
    ? { username: form.get("username"), password: form.get("password"), deviceId: form.get("deviceId") }
    : { baseUrl: form.get("baseUrl"), token: form.get("token") };
  const config = validateProviderConfig(input.provider, raw);
  const encryptedConfig = encryptProviderConfig(input.branchId, input.provider, config);
  await db().$transaction(async (tx) => {
    await tx.providerIntegration.upsert({
      where: { branchId_provider: { branchId: input.branchId, provider: input.provider } },
      create: { branchId: input.branchId, provider: input.provider, encryptedConfig, enabled: false, lastTestStatus: "NOT_TESTED", lastTestMessage: "Saved; send an explicit test before enabling." },
      update: { encryptedConfig, enabled: false, lastTestStatus: "NOT_TESTED", lastTestAt: null, lastTestMessage: "Settings changed; send a new test before enabling." },
    });
    await audit(tx, { branchId: input.branchId, userId: admin.id, action: "PLATFORM_PROVIDER_CONFIG_SAVED", entity: "ProviderIntegration", entityId: input.provider, after: { provider: input.provider, enabled: false, wasEnabled: Boolean(existing?.enabled), credentialsEncrypted: true } });
  });
  revalidatePath(`/platform/shops/${input.branchId}`);
}

export async function setProviderEnabled(form: FormData) {
  const admin = await assertPlatformAdmin();
  const input = z.object({ branchId: shopIdSchema, provider: providerSchema, enabled: z.enum(["true", "false"]) }).parse(Object.fromEntries(form.entries()));
  await db().$transaction(async (tx) => {
    const saved = await tx.providerIntegration.findUnique({ where: { branchId_provider: { branchId: input.branchId, provider: input.provider } }, select: { lastTestStatus: true } });
    const enabled = input.enabled === "true";
    if (!saved) throw new Error("Save provider settings first.");
    if (enabled && saved.lastTestStatus !== "SUCCESS") throw new Error("Send a successful test message before enabling this provider.");
    await tx.providerIntegration.update({ where: { branchId_provider: { branchId: input.branchId, provider: input.provider } }, data: { enabled } });
    await audit(tx, { branchId: input.branchId, userId: admin.id, action: enabled ? "PLATFORM_PROVIDER_ENABLED" : "PLATFORM_PROVIDER_DISABLED", entity: "ProviderIntegration", entityId: input.provider, after: { provider: input.provider, enabled } });
  });
  revalidatePath(`/platform/shops/${input.branchId}`);
}

export async function testProviderConnection(form: FormData) {
  const admin = await assertPlatformAdmin();
  const input = z.object({
    branchId: shopIdSchema,
    provider: providerSchema,
    phone: z.preprocess(
      (value) => typeof value === "string" ? value.replace(/[\s-]/g, "") : value,
      z.string().regex(/^(?:\+?91)?[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number, with or without +91."),
    ),
    confirmed: z.literal("on"),
  }).parse(Object.fromEntries(form.entries()));
  const phoneDigits = input.phone.replace(/\D/g, "");
  const recipient = phoneDigits.length === 10 ? `+91${phoneDigits}` : `+${phoneDigits}`;
  const integration = await db().providerIntegration.findUnique({ where: { branchId_provider: { branchId: input.branchId, provider: input.provider } }, select: { encryptedConfig: true } });
  if (!integration) throw new Error("Save provider settings before testing.");
  const masked = `***${phoneDigits.slice(-4)}`;
  let status = "SUCCESS";
  let detail = "Test message accepted by provider.";
  try {
    const message = "MediShop TEST: Provider connection check. No booking or purchase is being made.";
    if (input.provider === ProviderKind.SMSGATE) {
      if (process.env.SMS_SEND_ENABLED !== "true") throw new Error("SMS emergency send switch is off.");
      const credentials = decryptProviderConfig<SmsConfig>(input.branchId, input.provider, integration.encryptedConfig);
        await sendSms({ id: randomUUID().replaceAll("-", ""), branchId: input.branchId, phone: recipient, body: message }, fetch, credentials);
    } else {
      if (process.env.EVOLUTION_GO_SEND_ENABLED !== "true") throw new Error("WhatsApp emergency send switch is off.");
      const credentials = decryptProviderConfig<EvolutionConfig>(input.branchId, input.provider, integration.encryptedConfig);
        await sendEvolutionGoText({ branchId: input.branchId, phone: recipient, text: message }, fetch, credentials);
    }
  } catch (error) {
    status = "FAILED";
    detail = error instanceof Error ? error.message.slice(0, 255) : "Provider test failed.";
  }
  await db().$transaction(async (tx) => {
    await tx.providerIntegration.update({ where: { branchId_provider: { branchId: input.branchId, provider: input.provider } }, data: { lastTestAt: new Date(), lastTestStatus: status, lastTestMessage: `${detail} Recipient ${masked}.` } });
    await audit(tx, { branchId: input.branchId, userId: admin.id, action: "PLATFORM_PROVIDER_TEST", entity: "ProviderIntegration", entityId: input.provider, after: { provider: input.provider, status, recipient: masked, detail } });
  });
  revalidatePath(`/platform/shops/${input.branchId}`);
  if (status !== "SUCCESS") redirect(`/platform/shops/${input.branchId}?test=failed`);
  redirect(`/platform/shops/${input.branchId}?test=success`);
}
