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
import { retryMessageAction } from "../../src/features/notifications/retry-actions";
import { db } from "../../src/server/db";
const prisma = new PrismaClient();
let customerId = "";
const jobs: string[] = [];
const form = (id: string, confirmed = true) => {
  const data = new FormData();
  data.set("id", id);
  if (confirmed) data.set("confirmed", "on");
  return data;
};
async function failed(
  status = "FAILED",
  providerId: string | null = null,
  expiresAt?: string,
) {
  const id = randomUUID();
  jobs.push(id);
  await prisma.job.create({
    data: {
      id,
      key: `retry-test:${id}`,
      type: "CUSTOM_SMS",
      status: "FAILED",
      attempts: 3,
      runAt: new Date(),
      payload: {
        branchId: ctx.branch.id,
        customerId,
        body: "Test only",
        ...(expiresAt ? { expiresAt } : {}),
      },
    },
  });
  await prisma.notificationLog.create({
    data: {
      id,
      branchId: ctx.branch.id,
      customerId,
      channel: "SMS",
      templateKey: "MANUAL",
      payload: { body: "Test only" },
      status,
      providerId,
      scheduledFor: new Date(),
    },
  });
  return id;
}
beforeAll(async () => {
  if (
    !/^\/medishop_restore_\d+$/.test(
      new URL(process.env.DATABASE_URL ?? "").pathname,
    )
  )
    throw new Error("Requires isolated restore database.");
  const branch = await prisma.branch.create({
    data: {
      name: "Retry verification",
      address: "Test",
      phone: "",
      demo: false,
    },
  });
  ctx = {
    branch,
    role: Role.OWNER,
    user: {
      id: "retry-test",
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
        name: "Test recipient",
        phone: "+919999999999",
        consentSms: true,
      },
    })
  ).id;
});
afterAll(async () => {
  if (ctx) {
    await prisma.auditLog.deleteMany({ where: { branchId: ctx.branch.id } });
    await prisma.notificationLog.deleteMany({ where: { id: { in: jobs } } });
    await prisma.job.deleteMany({ where: { id: { in: jobs } } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.branch.delete({ where: { id: ctx.branch.id } });
  }
  await prisma.$disconnect();
  await db().$disconnect();
});
it("queues one retry with the same provider key even with simultaneous clicks", async () => {
  const id = await failed();
  const result = await Promise.all([
    retryMessageAction({ error: "" }, form(id)),
    retryMessageAction({ error: "" }, form(id)),
  ]);
  expect(result.every((item) => !item.error)).toBe(true);
  const job = await prisma.job.findUniqueOrThrow({ where: { id } });
  expect(job.status).toBe("PENDING");
  expect(job.attempts).toBe(0);
  expect(job.id).toBe(id);
  expect(
    await prisma.auditLog.count({
      where: { entityId: id, action: "RETRY_SMS" },
    }),
  ).toBe(1);
});
it("blocks uncertain, submitting, accepted and expired messages", async () => {
  for (const [status, provider] of [
    ["UNKNOWN", null],
    ["SUBMITTING", null],
    ["FAILED", "provider-accepted"],
    ["DELIVERED", "provider-delivered"],
  ] as const) {
    const id = await failed(status, provider);
    expect((await retryMessageAction({ error: "" }, form(id))).error).toContain(
      "cannot be retried safely",
    );
  }
  const expired = await failed(
    "FAILED",
    null,
    new Date(Date.now() - 60000).toISOString(),
  );
  expect(
    (await retryMessageAction({ error: "" }, form(expired))).error,
  ).toContain("expire");
});
it("rechecks consent, permission, confirmation and branch", async () => {
  const id = await failed();
  expect(
    (await retryMessageAction({ error: "" }, form(id, false))).error,
  ).toContain("Confirm");
  await prisma.customer.update({
    where: { id: customerId },
    data: { consentSms: false },
  });
  expect((await retryMessageAction({ error: "" }, form(id))).error).toContain(
    "not agreed",
  );
  ctx.role = Role.CASHIER;
  expect((await retryMessageAction({ error: "" }, form(id))).error).toContain(
    "Permission denied",
  );
  ctx.role = Role.OWNER;
  const original = ctx.branch.id;
  ctx.branch.id = randomUUID();
  expect((await retryMessageAction({ error: "" }, form(id))).error).toContain(
    "not found",
  );
  ctx.branch.id = original;
});
