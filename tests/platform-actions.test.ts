import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderKind } from "@prisma/client";
import { encryptProviderConfig } from "@/lib/provider-integrations";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  find: vi.fn(), findUser: vi.fn(), findBranch: vi.fn(), upsert: vi.fn(), update: vi.fn(), audit: vi.fn(), createBranch: vi.fn(), deleteBranch: vi.fn(),
  deleteMemberships: vi.fn(), deleteIntegrations: vi.fn(),
  branchMedicineCount: vi.fn(), batchCount: vi.fn(), supplierCount: vi.fn(), purchaseCount: vi.fn(), movementCount: vi.fn(), customerCount: vi.fn(), invoiceCount: vi.fn(), saleCount: vi.fn(), creditCount: vi.fn(), doctorCount: vi.fn(), appointmentCount: vi.fn(), templateCount: vi.fn(), notificationCount: vi.fn(), broadcastCount: vi.fn(), heldBillCount: vi.fn(), receiptCount: vi.fn(), reminderCount: vi.fn(), orderCount: vi.fn(), loyaltyCount: vi.fn(), deviceCount: vi.fn(), reservationCount: vi.fn(), transferFromCount: vi.fn(), transferToCount: vi.fn(), deliveryCount: vi.fn(), bookingLinkCount: vi.fn(),
  assertAdmin: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(),
  fetch: vi.fn(),
}));
const tx = {
  providerIntegration: { upsert: mocks.upsert, update: mocks.update, deleteMany: mocks.deleteIntegrations },
  auditLog: { create: mocks.audit },
  branch: { create: mocks.createBranch, findUnique: mocks.findBranch, delete: mocks.deleteBranch },
  membership: { deleteMany: mocks.deleteMemberships }, user: { findUnique: mocks.findUser },
  branchMedicine: { count: mocks.branchMedicineCount }, batch: { count: mocks.batchCount }, supplier: { count: mocks.supplierCount }, purchase: { count: mocks.purchaseCount }, stockMovement: { count: mocks.movementCount }, customer: { count: mocks.customerCount }, invoiceCounter: { count: mocks.invoiceCount }, sale: { count: mocks.saleCount }, creditEntry: { count: mocks.creditCount }, doctor: { count: mocks.doctorCount }, appointment: { count: mocks.appointmentCount }, notificationTemplate: { count: mocks.templateCount }, notificationLog: { count: mocks.notificationCount }, broadcast: { count: mocks.broadcastCount }, heldBill: { count: mocks.heldBillCount }, receiptShare: { count: mocks.receiptCount }, refillReminder: { count: mocks.reminderCount }, purchaseOrder: { count: mocks.orderCount }, loyaltyEntry: { count: mocks.loyaltyCount }, device: { count: mocks.deviceCount }, stockReservation: { count: mocks.reservationCount }, transfer: { count: vi.fn().mockResolvedValue(0) }, delivery: { count: mocks.deliveryCount }, publicBookingLink: { count: mocks.bookingLinkCount },
};
vi.mock("@/lib/platform-admin", () => ({ assertPlatformAdmin: mocks.assertAdmin }));
vi.mock("@/server/db", () => ({ db: () => ({ providerIntegration: { findUnique: mocks.find }, user: { findUnique: mocks.findUser }, $transaction: (work: (arg: typeof tx) => unknown) => work(tx) }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { mocks.redirect(path); throw new Error("redirect"); } }));

import { createPlatformShop, deleteEmptyPlatformShop, saveProviderConfig, testProviderConnection } from "@/features/platform/actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("SMS_SEND_ENABLED", "true");
  vi.stubEnv("EVOLUTION_GO_SEND_ENABLED", "true");
  mocks.assertAdmin.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "test-accepted", state: "Sent" }), { status: 201, headers: { "Content-Type": "application/json" } }));
  mocks.findUser.mockResolvedValue(null);
  mocks.findBranch.mockResolvedValue({ id: "shop-a", name: "Sample Pharmacy" });
  for (const mock of [mocks.branchMedicineCount,mocks.batchCount,mocks.supplierCount,mocks.purchaseCount,mocks.movementCount,mocks.customerCount,mocks.invoiceCount,mocks.saleCount,mocks.creditCount,mocks.doctorCount,mocks.appointmentCount,mocks.templateCount,mocks.notificationCount,mocks.broadcastCount,mocks.heldBillCount,mocks.receiptCount,mocks.reminderCount,mocks.orderCount,mocks.loyaltyCount,mocks.deviceCount,mocks.reservationCount,mocks.deliveryCount,mocks.bookingLinkCount]) mock.mockResolvedValue(0);
  mocks.deleteBranch.mockResolvedValue({ id: "shop-a" });
  mocks.createBranch.mockImplementation(async ({ data }) => ({ id: "shop-created", name: data.name }));
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("platform provider actions", () => {
  it("removes a shop only after exact-name confirmation and an empty-data check", async () => {
    await expect(deleteEmptyPlatformShop(form({ branchId: "shop-a", confirmation: "Sample Pharmacy" }))).rejects.toThrow("redirect");
    expect(mocks.deleteMemberships).toHaveBeenCalledWith({ where: { branchId: "shop-a" } });
    expect(mocks.deleteBranch).toHaveBeenCalledWith({ where: { id: "shop-a" } });
    expect(mocks.audit.mock.calls[0][0].data.action).toBe("PLATFORM_EMPTY_SHOP_DELETED");
  });

  it("blocks deletion when operational records exist", async () => {
    mocks.saleCount.mockResolvedValue(1);
    await expect(deleteEmptyPlatformShop(form({ branchId: "shop-a", confirmation: "Sample Pharmacy" }))).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/platform?error=shop_has_data");
    expect(mocks.deleteBranch).not.toHaveBeenCalled();
    expect(mocks.deleteMemberships).not.toHaveBeenCalled();
  });

  it("does not delete when the shop name confirmation does not match", async () => {
    await expect(deleteEmptyPlatformShop(form({ branchId: "shop-a", confirmation: "Other Shop" }))).rejects.toThrow("redirect");
    expect(mocks.deleteBranch).not.toHaveBeenCalled();
  });

  it("creates a shop, owner membership and forced password change in one transaction", async () => {
    await expect(createPlatformShop(form({ name: "Sample Pharmacy", address: "10 Main Road, City", phone: "+919876543210", ownerName: "Owner Person", ownerEmail: "owner@example.test", initialPassword: "temporary-password-123" }))).rejects.toThrow("redirect");
    const branchData = mocks.createBranch.mock.calls[0][0].data;
    expect(branchData.memberships.create).toMatchObject({ role: "OWNER", user: { create: { email: "owner@example.test", mustChangePassword: true } } });
    expect(branchData.memberships.create.user.create.passwordHash).not.toBe("temporary-password-123");
    expect(mocks.audit.mock.calls[0][0].data).toMatchObject({ action: "PLATFORM_SHOP_CREATED", branchId: "shop-created" });
  });
  it("links an existing owner account to another shop without resetting their password", async () => {
    mocks.findUser.mockResolvedValue({ id: "existing-owner", active: true });
    await expect(createPlatformShop(form({ name: "Second Pharmacy", address: "20 Market Road, City", phone: "+919876543210", ownerEmail: "owner@example.test" }))).rejects.toThrow("redirect");
    expect(mocks.createBranch.mock.calls[0][0].data.memberships.create).toEqual({ role: "OWNER", user: { connect: { id: "existing-owner" } } });
    expect(mocks.audit.mock.calls[0][0].data.after.ownerEmail).toBe("owner@example.test");
  });
  it("saves encrypted SMS settings without sending a message", async () => {
    mocks.find.mockResolvedValue(null);
    await saveProviderConfig(form({ branchId: "shop-a", provider: "SMSGATE", username: "shop-user", password: "private-password", deviceId: "device-a" }));
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved.create.encryptedConfig).not.toContain("private-password");
    expect(saved.create.enabled).toBe(false);
    expect(saved.create.lastTestStatus).toBe("NOT_TESTED");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends and audits only an explicitly confirmed labelled test", async () => {
    const encryptedConfig = encryptProviderConfig("shop-a", ProviderKind.SMSGATE, { username: "shop-user", password: "private-password", deviceId: "device-a" });
    mocks.find.mockResolvedValue({ encryptedConfig });
      await expect(testProviderConnection(form({ branchId: "shop-a", provider: "SMSGATE", phone: "8260586748", confirmed: "on" }))).rejects.toThrow("redirect");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const request = mocks.fetch.mock.calls[0];
    expect(request[0]).toBe("https://api.sms-gate.app/3rdparty/v1/messages");
    expect(JSON.parse(request[1].body).id).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.parse(request[1].body)).toMatchObject({ phoneNumbers: ["+918260586748"], textMessage: { text: expect.stringContaining("MediShop TEST") } });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ lastTestStatus: "SUCCESS" });
    expect(mocks.audit.mock.calls[0][0].data.after).toMatchObject({ status: "SUCCESS", recipient: "***6748" });
    expect(JSON.stringify(mocks.audit.mock.calls[0][0].data)).not.toContain("+918260586748");
    expect(JSON.stringify(mocks.audit.mock.calls[0][0].data)).not.toContain("private-password");
  });

  it("refuses a test send without the explicit checkbox", async () => {
    await expect(testProviderConnection(form({ branchId: "shop-a", provider: "SMSGATE", phone: "+918260586748" }))).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
