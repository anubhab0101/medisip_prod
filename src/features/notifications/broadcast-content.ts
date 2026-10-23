import { z } from "zod";
import { Channel } from "@prisma/client";
import { id, operationId } from "@/lib/validation";
export const broadcastSchema = z.object({
  operationId,
  channel: z.nativeEnum(Channel),
  audience: z.enum(["ALL", "SELECTED"]),
  customerIds: z.array(id).max(10000).default([]),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(1200),
  expiresAt: z.string().datetime().optional(),
});
export function broadcastBody(shop: string, body: string) {
  return `${shop}: ${body}\nTo opt out of announcements, contact the shop.`;
}
export function eligibleCustomer(
  customer: {
    active: boolean;
    consentSms: boolean;
    consentWhatsapp: boolean;
    consentEmail: boolean;
    phone: string;
    email: string;
  },
  channel: Channel,
) {
  if (!customer.active) return false;
  if (channel === Channel.EMAIL)
    return customer.consentEmail && z.email().safeParse(customer.email).success;
  return (
    (channel === Channel.SMS
      ? customer.consentSms
      : customer.consentWhatsapp) && /^\+?[1-9]\d{7,14}$/.test(customer.phone)
  );
}
export function doctorAnnouncement(input: {
  doctor: string;
  date: string;
  from: string;
  to: string;
  bookingUrl: string;
  phone: string;
}) {
  const date = new Date(`${input.date}T00:00:00+05:30`);
  const when = Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : input.date;
  return `${input.doctor || "Our doctor"} will be available on ${when} from ${input.from || "…"} to ${input.to || "…"}. Book your appointment now: ${input.bookingUrl.trim() || `call ${input.phone}`}.`;
}
