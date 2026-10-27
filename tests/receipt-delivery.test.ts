import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  sale: vi.fn(),
  issueReceipt: vi.fn(),
  findJob: vi.fn(),
  createJob: vi.fn(),
  createLog: vi.fn(),
  createAudit: vi.fn(),
  transaction: vi.fn(),
}));
const tx = {
  job: { findUnique: mocks.findJob, create: mocks.createJob },
  notificationLog: { create: mocks.createLog },
  auditLog: { create: mocks.createAudit },
};
vi.mock("@/server/context", () => ({ context: mocks.context }));
vi.mock("@/server/db", () => ({ db: () => ({ sale: { findFirst: mocks.sale } }) }));
vi.mock("@/server/transaction", () => ({
  transaction: (work: (client: typeof tx) => Promise<unknown>) =>
    mocks.transaction(work),
}));
vi.mock("@/features/receipts/issuance", () => ({
  issueReceipt: mocks.issueReceipt,
}));
vi.mock("@/lib/job-signature", () => ({ signJobPayload: () => "test-signature" }));
vi.mock("@/lib/provider-integrations", () => ({ branchProviderEnabled: async (_branchId: string, provider: string) => provider === "SMSGATE" }));
import { queueReceiptDelivery } from "../src/features/receipts/delivery";

const requestId = "f0c7a4f6-a247-4a0c-9d4d-b87ef5c0b6aa";
beforeEach(() => {
  vi.resetAllMocks();
  process.env.SMS_SEND_ENABLED = "true";
  process.env.EVOLUTION_GO_SEND_ENABLED = "false";
  mocks.context.mockResolvedValue({
    branch: { id: "branch-1", demo: false },
    user: { id: "staff-1" },
  });
  mocks.sale.mockResolvedValue({
    id: "sale-1",
    status: "PAID",
    customer: {
      id: "customer-1",
      active: true,
      consentSms: true,
      consentWhatsapp: true,
    },
  });
  mocks.issueReceipt.mockResolvedValue("https://receipts.example.test/r/token");
  mocks.findJob.mockResolvedValue(null);
  mocks.createJob.mockResolvedValue({ id: "job-1", runAt: new Date() });
  mocks.transaction.mockImplementation((work) => work(tx));
});

describe("receipt delivery queue", () => {
  it("queues an opted-in SMS without storing the bearer receipt URL", async () => {
    await expect(
      queueReceiptDelivery({ saleId: "sale-1", requestId, channel: "SMS" }),
    ).resolves.toBe("job-1");

    expect(mocks.issueReceipt).toHaveBeenCalledWith("branch-1", "sale-1", requestId);
    const job = mocks.createJob.mock.calls[0][0];
    expect(job.data.type).toBe("SALE_RECEIPT");
    expect(job.data.payload).toMatchObject({
      branchId: "branch-1",
      customerId: "customer-1",
      saleId: "sale-1",
      receiptShareId: requestId,
    });
    expect(JSON.stringify(job.data.payload)).not.toContain("https://");
    expect(mocks.createLog.mock.calls[0][0].data.status).toBe("QUEUED");
  });

  it("blocks sending if consent was not recorded", async () => {
    mocks.sale.mockResolvedValue({
      id: "sale-1",
      status: "PAID",
      customer: { id: "customer-1", active: true, consentSms: false },
    });
    await expect(
      queueReceiptDelivery({ saleId: "sale-1", requestId, channel: "SMS" }),
    ).rejects.toThrow("has not agreed");
    expect(mocks.issueReceipt).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("keeps WhatsApp unavailable until its provider is enabled", async () => {
    await expect(
      queueReceiptDelivery({
        saleId: "sale-1",
        requestId,
        channel: "WHATSAPP",
      }),
    ).rejects.toThrow("WhatsApp sending is not enabled yet");
    expect(mocks.createJob).not.toHaveBeenCalled();
  });
});
