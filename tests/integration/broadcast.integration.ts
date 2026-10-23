import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, Role, Channel } from "@prisma/client";
import type { AppContext } from "../../src/server/context";
import { can, type PermissionName } from "../../src/lib/permissions";
import { BusinessError } from "../../src/lib/errors";
let ctx: AppContext;
vi.mock("@/server/context", () => ({
  context: async (permission: PermissionName) => {
    if (!can(ctx.role, permission))
      throw new BusinessError("Permission denied");
    return ctx;
  },
}));
import {
  previewBroadcast,
  confirmBroadcast,
  openBroadcastMessage,
} from "../../src/features/notifications/broadcast-service";
import { db } from "../../src/server/db";
const prisma = new PrismaClient();
let first: string, second: string, noConsent: string;
const input = () => ({
  operationId: randomUUID(),
  channel: Channel.WHATSAPP,
  audience: "ALL",
  title: "Test announcement",
  body: "A fictional doctor is visiting. Call the shop to book.",
});
beforeAll(async () => {
  if (
    !new URL(process.env.DATABASE_URL ?? "").pathname.startsWith(
      "/medishop_dev",
    )
  )
    throw new Error("Requires isolated development database.");
  const branch = await prisma.branch.create({
    data: {
      name: "Broadcast integration",
      address: "Test",
      phone: "9999999999",
      demo: true,
    },
  });
  ctx = {
    branch,
    role: Role.OWNER,
    user: {
      id: "test",
      name: "Test",
      email: "test@example.invalid",
      locale: "en",
    },
    memberships: [],
  };
  const customer = async (phone: string, consent: boolean) =>
    (
      await prisma.customer.create({
        data: {
          branchId: branch.id,
          name: "Test recipient",
          phone,
          consentWhatsapp: consent,
          consentSms: consent,
        },
      })
    ).id;
  first = await customer("+919999999991", true);
  second = await customer("+919999999992", true);
  noConsent = await customer("+919999999993", false);
});
afterAll(async () => {
  if (ctx)
    await prisma.branch.update({
      where: { id: ctx.branch.id },
      data: { active: false, demo: true },
    });
  await db().$disconnect();
  await prisma.$disconnect();
});
it("previews only consented customers without queuing or sending", async () => {
  const request = input();
  const id = await previewBroadcast(request);
  expect(await previewBroadcast(request)).toBe(id);
  const broadcast = await prisma.broadcast.findUniqueOrThrow({ where: { id } });
  expect(broadcast.recipientCount).toBe(2);
  expect(broadcast.skippedCount).toBe(1);
  expect(
    await prisma.notificationLog.count({
      where: { broadcastId: id, customerId: noConsent },
    }),
  ).toBe(0);
  const logs = await prisma.notificationLog.findMany({
    where: { broadcastId: id },
  });
  expect(
    await prisma.job.count({ where: { id: { in: logs.map((l) => l.id) } } }),
  ).toBe(0);
  await expect(confirmBroadcast({ id, confirmed: true })).rejects.toThrow(
    "practice mode",
  );
});
it("rechecks revoked consent at confirmation and is idempotent", async () => {
  const id = await previewBroadcast(input());
  await prisma.customer.update({
    where: { id: second },
    data: { consentWhatsapp: false },
  });
  ctx.branch.demo = false;
  try {
    await confirmBroadcast({ id, confirmed: true });
    await confirmBroadcast({ id, confirmed: true });
    expect(
      (await prisma.broadcast.findUniqueOrThrow({ where: { id } }))
        .recipientCount,
    ).toBe(1);
    expect(
      await prisma.notificationLog.count({
        where: { broadcastId: id, status: "READY_FOR_MANUAL_SEND" },
      }),
    ).toBe(1);
    expect(
      await prisma.notificationLog.count({
        where: { broadcastId: id, status: "SKIPPED" },
      }),
    ).toBe(1);
  } finally {
    ctx.branch.demo = true;
  }
});
it("rejects empty selected audiences, cross-shop access and cashier access", async () => {
  await expect(
    previewBroadcast({ ...input(), audience: "SELECTED", customerIds: [] }),
  ).rejects.toThrow("Select at least");
  const id = await previewBroadcast({
    ...input(),
    audience: "SELECTED",
    customerIds: [first],
  });
  const original = ctx.branch.id;
  ctx.branch.id = "another-shop";
  ctx.branch.demo = false;
  try {
    await expect(confirmBroadcast({ id, confirmed: true })).rejects.toThrow(
      "not found",
    );
  } finally {
    ctx.branch.id = original;
    ctx.branch.demo = true;
  }
  ctx.role = Role.CASHIER;
  try {
    await expect(previewBroadcast(input())).rejects.toThrow(
      "Permission denied",
    );
  } finally {
    ctx.role = Role.OWNER;
  }
});
it("does not prepare external messages from a practice shop", async () => {
  const id = await previewBroadcast(input());
  const log = await prisma.notificationLog.findFirstOrThrow({
    where: { broadcastId: id },
  });
  await expect(openBroadcastMessage(log.id)).rejects.toThrow("practice mode");
});
it("queues exactly one durable SMS job per eligible recipient on repeated confirmation", async () => {
  const id = await previewBroadcast({ ...input(), channel: Channel.SMS });
  ctx.branch.demo = false;
  vi.stubEnv("SMS_SEND_ENABLED", "true");
  vi.stubEnv("SMSGATE_USERNAME", "test-only");
  vi.stubEnv("SMSGATE_PASSWORD", "test-only");
  try {
    await confirmBroadcast({ id, confirmed: true });
    await confirmBroadcast({ id, confirmed: true });
    const logs = await prisma.notificationLog.findMany({
      where: { broadcastId: id },
    });
    expect(logs).toHaveLength(2);
    expect(logs.every((log) => log.status === "QUEUED")).toBe(true);
    const jobs = await prisma.job.findMany({
      where: { id: { in: logs.map((log) => log.id) } },
    });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.type === "CUSTOM_SMS")).toBe(true);
    // The actual branch remains practice-only throughout; also retire test jobs.
    await prisma.job.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: {
        status: "DONE",
        lastError: "Test queue verification only; no message submitted.",
      },
    });
  } finally {
    ctx.branch.demo = true;
    vi.unstubAllEnvs();
  }
});
