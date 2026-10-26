import { describe, it, expect, vi, afterEach } from "vitest";
import { returnShare } from "../src/features/billing/return-pricing";
import { slotsForDay, overlaps } from "../src/features/appointments/slots";
import {
  manualMessage,
  promotionalSendAt,
  renderTemplate,
} from "../src/features/notifications/content";
import { sendSms } from "../src/features/notifications/smsgate";
import { SecretManager } from "@/lib/secret-manager";
vi.mock("server-only", () => ({}));
afterEach(() => {
  vi.unstubAllEnvs();
  SecretManager.getInstance().clearCache();
});
describe("partial returns", () => {
  it("returns every paise exactly once across three refunds", () =>
    expect(
      [0, 1, 2].reduce((n, old) => n + returnShare(100, 3, old, 1), 0),
    ).toBe(100));
  it("rejects over-returns", () =>
    expect(() => returnShare(100, 3, 2, 2)).toThrow());
});
describe("appointments", () => {
  it("honours breaks and skips past times", () => {
    const windows = [
      { weekday: 4, startMinute: 540, endMinute: 600 },
      { weekday: 4, startMinute: 660, endMinute: 690 },
    ];
    const slots = slotsForDay(
      "2026-10-08",
      windows,
      30,
      new Date("2026-10-08T03:45:00Z"),
    );
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-10-08T04:00:00.000Z",
      "2026-10-08T05:30:00.000Z",
    ]);
  });
  it("rejects invalid slot lengths", () =>
    expect(() => slotsForDay("2026-10-08", [], 0)).toThrow());
  it("detects overlapping but not adjacent appointments", () => {
    const slot = (a: number, b: number) => ({
      startsAt: new Date(a),
      endsAt: new Date(b),
    });
    expect(overlaps(slot(1, 4), slot(3, 5))).toBe(true);
    expect(overlaps(slot(1, 4), slot(4, 5))).toBe(false);
  });
});
describe("message controls", () => {
  it("URL-encodes user content in redirects", () => {
    expect(manualMessage("WHATSAPP", "+919999999999", "A & B")).toBe(
      "https://wa.me/919999999999?text=A%20%26%20B",
    );
    expect(manualMessage("EMAIL", "a@example.com", "Hello & bye")).toContain(
      "body=Hello%20%26%20bye",
    );
  });
  it("defers promotion through quiet hours in India", () => {
    expect(
      promotionalSendAt(new Date("2026-10-08T16:00:00Z")).toISOString(),
    ).toBe("2026-10-09T02:30:00.000Z");
    expect(
      promotionalSendAt(new Date("2026-10-08T01:00:00Z")).toISOString(),
    ).toBe("2026-10-08T02:30:00.000Z");
  });
  it("retains unknown template placeholders for review", () =>
    expect(renderTemplate("Hello {name}, {unknown}", { name: "A" })).toBe(
      "Hello A, {unknown}",
    ));
  it("cannot send while live SMS is disabled", async () => {
    vi.stubEnv("SMS_SEND_ENABLED", "false");
    const request = vi.fn();
    await expect(
      sendSms({ id: "x", phone: "+919999999999", body: "Test" }, request),
    ).rejects.toThrow("disabled");
    expect(request).not.toHaveBeenCalled();
  });
  it("marks a timeout as uncertain, not safely retryable", async () => {
    vi.stubEnv("SMS_SEND_ENABLED", "true");
    vi.stubEnv("SMSGATE_USERNAME", "test-user");
    vi.stubEnv("SMSGATE_PASSWORD", "test-password-16-chars");
    const request = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(
      sendSms({ id: "x", phone: "+919999999999", body: "Test" }, request),
    ).rejects.toMatchObject({ uncertain: true, retryable: false });
  });
});
