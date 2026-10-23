import { describe, it, expect } from "vitest";
import { Channel } from "@prisma/client";
import {
  broadcastBody,
  eligibleCustomer,
  doctorAnnouncement,
} from "../src/features/notifications/broadcast-content";
const customer = {
  active: true,
  phone: "+919999999999",
  email: "test@example.com",
  consentSms: true,
  consentWhatsapp: false,
  consentEmail: true,
};
describe("broadcast content and consent", () => {
  it("requires consent for the exact channel and an active customer", () => {
    expect(eligibleCustomer(customer, Channel.SMS)).toBe(true);
    expect(eligibleCustomer(customer, Channel.WHATSAPP)).toBe(false);
    expect(eligibleCustomer({ ...customer, active: false }, Channel.SMS)).toBe(
      false,
    );
    expect(
      eligibleCustomer({ ...customer, email: "invalid" }, Channel.EMAIL),
    ).toBe(false);
  });
  it("includes the shop and a practical opt-out instruction", () => {
    expect(broadcastBody("Example Pharmacy", "Doctor today")).toContain(
      "Example Pharmacy: Doctor today",
    );
    expect(broadcastBody("Shop", "News")).toContain("opt out");
  });
  it("makes a doctor visit announcement with a booking action", () => {
    const text = doctorAnnouncement({
      doctor: "Dr Example",
      date: "2026-10-09",
      from: "17:00",
      to: "19:00",
      bookingUrl: "",
      phone: "9999999999",
    });
    expect(text).toContain("Dr Example");
    expect(text).toContain("17:00 to 19:00");
    expect(text).toContain("call 9999999999");
  });
});
