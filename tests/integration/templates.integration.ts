import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";
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
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { saveTemplateAction } from "../../src/features/notifications/template-actions";
import { prepareMessage } from "../../src/features/notifications/actions";
import { db } from "../../src/server/db";
const prisma = new PrismaClient();
let templateId = "",
  customerId = "";
const operations: string[] = [];
function form(overrides: Record<string, string> = {}) {
  const value = new FormData();
  for (const [key, content] of Object.entries({
    id: templateId,
    key: "Visit reminder",
    channel: "SMS",
    body: "Hello {name}, Dr {doctor} at {shop}, {time}",
    active: "on",
    promotional: "on",
    ...overrides,
  }))
    value.set(key, content);
  return value;
}
beforeAll(async () => {
  if (
    !/^\/medishop_restore_\d+$/.test(
      new URL(process.env.DATABASE_URL ?? "").pathname,
    )
  )
    throw new Error(
      "Template tests require a separate restore-rehearsal database; never run against the clean shop.",
    );
  const branch = await prisma.branch.create({
    data: {
      name: "Isolated template verification",
      address: "Test",
      phone: "+919999999991",
      demo: false,
    },
  });
  ctx = {
    branch,
    role: Role.OWNER,
    user: {
      id: "template-test",
      name: "Test",
      email: "test@example.invalid",
      locale: "en",
    },
    memberships: [],
  };
  customerId = (
    await prisma.customer.create({
      data: {
        branchId: branch.id,
        name: "Verified recipient",
        phone: "+919999999991",
        consentSms: true,
      },
    })
  ).id;
});
afterAll(async () => {
  if (ctx) {
    await prisma.job.deleteMany({
      where: { key: { in: operations.map((id) => `manual:${id}`) } },
    });
    await prisma.auditLog.deleteMany({ where: { branchId: ctx.branch.id } });
    await prisma.notificationLog.deleteMany({
      where: { branchId: ctx.branch.id },
    });
    await prisma.notificationTemplate.deleteMany({
      where: { branchId: ctx.branch.id },
    });
    await prisma.customer.deleteMany({ where: { branchId: ctx.branch.id } });
    await prisma.branch.delete({ where: { id: ctx.branch.id } });
  }
  await db().$disconnect();
  await prisma.$disconnect();
});
it("saves and audits reusable templates; rejects invalid variables and duplicates", async () => {
  const saved = await saveTemplateAction({ error: "" }, form());
  expect(saved.error).toBe("");
  templateId = saved.id!;
  expect(await prisma.auditLog.count({ where: { entityId: templateId } })).toBe(
    1,
  );
  expect(
    (await saveTemplateAction({ error: "" }, form({ id: "" }))).error,
  ).toContain("already exists");
  expect(
    (await saveTemplateAction({ error: "" }, form({ body: "{bad}" }))).error,
  ).toContain("Use only");
});
it("resolves stored wording and real recipient identity; cannot downgrade promotion", async () => {
  const operationId = randomUUID();
  operations.push(operationId);
  await prepareMessage({
    customerId,
    operationId,
    channel: "SMS",
    templateId,
    body: "Client modified text",
    promotional: false,
    variables: {
      name: "Forged",
      shop: "Forged",
      doctor: "Doctor A",
      time: "5 PM",
    },
  });
  const job = await prisma.job.findUniqueOrThrow({
    where: { key: `manual:${operationId}` },
  });
  expect(job.payload).toMatchObject({
    promotional: true,
    body: expect.stringContaining(
      "Hello Verified recipient, Dr Doctor A at Isolated template verification, 5 PM",
    ),
  });
  expect(job.status).toBe("PENDING");
  await expect(
    prepareMessage({
      customerId,
      operationId,
      channel: "SMS",
      templateId,
      body: "preview",
      promotional: false,
      variables: { doctor: "Changed doctor", time: "5 PM" },
    }),
  ).rejects.toThrow("different message");
});
it("tests only explicitly confirmed matching personal contacts and expires test SMS", async () => {
  await prisma.notificationTemplate.update({
    where: { id: templateId },
    data: { promotional: false },
  });
  const operationId = randomUUID();
  operations.push(operationId);
  const raw = {
    customerId,
    operationId,
    channel: "SMS",
    templateId,
    body: "preview",
    promotional: false,
    testMode: true,
    ownPhone: "+919999999991",
    ownRecipientConfirmed: true,
    variables: { doctor: "D", time: "5 PM" },
  };
  await expect(
    prepareMessage({ ...raw, ownRecipientConfirmed: false }),
  ).rejects.toThrow("confirm");
  await expect(
    prepareMessage({ ...raw, ownPhone: "+919999999992" }),
  ).rejects.toThrow("same number");
  await prepareMessage(raw);
  const job = await prisma.job.findUniqueOrThrow({
    where: { key: `manual:${operationId}` },
  });
  const payload = job.payload as { body: string; expiresAt: string };
  expect(payload.body).toContain("[TEST]");
  expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(Date.now());
  expect(new Date(payload.expiresAt).getTime()).toBeLessThan(
    Date.now() + 16 * 60000,
  );
  const email = await prisma.notificationTemplate.create({
    data: {
      branchId: ctx.branch.id,
      key: "Own email",
      channel: "EMAIL",
      body: "Hello {name}",
    },
  });
  await expect(
    prepareMessage({ ...raw, templateId: email.id, channel: "EMAIL" }),
  ).rejects.toThrow("staff sign-in email");
  await prisma.customer.update({
    where: { id: customerId },
    data: { email: ctx.user.email, consentEmail: true },
  });
  const result = await prepareMessage({
    ...raw,
    templateId: email.id,
    channel: "EMAIL",
  });
  expect(result.url).toContain(`mailto:${ctx.user.email}?`);
  expect(result.url).toContain("%5BTEST%5D");
  await prisma.notificationTemplate.update({
    where: { id: templateId },
    data: { promotional: true },
  });
});
it("still rejects missing consent and template variables", async () => {
  const raw = {
    customerId,
    operationId: randomUUID(),
    channel: "SMS",
    templateId,
    body: "preview",
    promotional: false,
    variables: { doctor: "D", time: "5 PM" },
  };
  await expect(prepareMessage({ ...raw, variables: {} })).rejects.toThrow(
    "Fill every",
  );
  await prisma.customer.update({
    where: { id: customerId },
    data: { consentSms: false },
  });
  await expect(prepareMessage(raw)).rejects.toThrow("not agreed");
});
it("denies other-shop template changes and unauthorized staff", async () => {
  expect(
    (await saveTemplateAction({ error: "" }, form({ id: randomUUID() }))).error,
  ).toContain("not found");
  ctx.role = Role.CASHIER;
  expect((await saveTemplateAction({ error: "" }, form())).error).toContain(
    "Permission denied",
  );
  ctx.role = Role.OWNER;
});
it("archives templates and refuses subsequent use", async () => {
  expect(
    (await saveTemplateAction({ error: "" }, form({ active: "" }))).error,
  ).toBe("");
  await expect(
    prepareMessage({
      customerId,
      operationId: randomUUID(),
      channel: "SMS",
      templateId,
      body: "preview",
      promotional: false,
    }),
  ).rejects.toThrow("unavailable");
});
