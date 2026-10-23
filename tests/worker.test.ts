import { beforeEach, it, expect, vi } from "vitest";
vi.mock("@/features/receipts/issuance", () => ({ issueReceipt: vi.fn() }));
const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finish: vi.fn(),
  send: vi.fn(),
  status: vi.fn(),
  branch: vi.fn(),
  customer: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  sendAt: vi.fn(),
  balance: vi.fn(),
  reminder: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  db: () => ({
    branch: { findUnique: mocks.branch },
    creditEntry: { aggregate: mocks.balance },
    refillReminder: { findFirst: mocks.reminder },
    customer: { findFirst: mocks.customer },
    notificationLog: {
      updateMany: mocks.updateMany,
      upsert: mocks.upsert,
      update: mocks.update,
    },
  }),
}));
vi.mock("@/server/jobs/queue", () => ({
  claimJob: mocks.claim,
  finishJob: mocks.finish,
}));
vi.mock("@/features/notifications/content", () => ({
  promotionalSendAt: mocks.sendAt,
}));
vi.mock("@/features/notifications/smsgate", () => ({
  sendSms: mocks.send,
  smsStatus: mocks.status,
  ProviderError: class extends Error {},
}));
import { workOnce } from "../src/server/jobs/worker";
const job = {
  id: "test-job",
  type: "CUSTOM_SMS",
  payload: {
    branchId: "shop",
    customerId: "customer",
    body: "Test announcement",
    promotional: true,
  },
  runAt: new Date(),
  attempts: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.claim.mockResolvedValue(job);
  mocks.branch.mockResolvedValue({ id: "shop", active: true, demo: false });
  mocks.customer.mockResolvedValue({
    id: "customer",
    active: true,
    consentSms: true,
    phone: "+919999999999",
  });
  mocks.sendAt.mockImplementation(() => new Date());
  mocks.upsert.mockResolvedValue({ id: job.id, status: "QUEUED" });
  mocks.send.mockResolvedValue({ id: job.id, state: "Pending" });
});
it("does not send when consent was revoked after confirmation", async () => {
  mocks.customer.mockResolvedValue({ active: true, consentSms: false });
  await workOnce();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ status: "SKIPPED" }),
    }),
  );
});
it("does not send stale doctor announcements", async () => {
  mocks.claim.mockResolvedValue({
    ...job,
    payload: { ...job.payload, expiresAt: "2020-01-01T00:00:00.000Z" },
  });
  await workOnce();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(
    expect.anything(),
    "DONE",
    "Skipped: announcement expired.",
  );
});
it("reschedules announcements outside permitted hours", async () => {
  mocks.sendAt.mockReturnValue(new Date(Date.now() + 3600000));
  await workOnce();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(
    expect.anything(),
    "PENDING",
    undefined,
    expect.any(Date),
  );
});
it("submits eligible announcements once using a stable provider id", async () => {
  await workOnce();
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
    id: job.id,
    phone: "+919999999999",
    body: "Test announcement",
  });
  expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), "DONE");
});

it("skips a scheduled credit reminder after the balance is settled", async () => {
  mocks.claim.mockResolvedValue({ ...job, type: "CREDIT_REMINDER" });
  mocks.balance.mockResolvedValue({ _sum: { amountPaise: 0 } });
  await workOnce();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(
    expect.anything(),
    "DONE",
    "Skipped: credit already settled.",
  );
});
it("does not send a cancelled refill reminder", async () => {
  mocks.claim.mockResolvedValue({
    ...job,
    type: "REFILL_REMINDER",
    payload: { ...job.payload, reminderId: "cancelled" },
  });
  mocks.reminder.mockResolvedValue(null);
  await workOnce();
  expect(mocks.send).not.toHaveBeenCalled();
});
