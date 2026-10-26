import "server-only";
import { createHash } from "node:crypto";
import type {
  Appointment,
  Doctor,
  LoginAttempt,
  PublicBookingLink,
} from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { transaction } from "@/server/transaction";
import { BusinessError } from "@/lib/errors";
import { id, name, operationId, phone } from "@/lib/validation";
import { shopDate } from "@/lib/date";
import { slotsForDay, overlaps } from "@/features/appointments/slots";

export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const publicBookingSchema = z.object({
  token: tokenSchema,
  doctorId: id,
  operationId,
  startsAt: z.string().datetime(),
  name,
  phone,
  confirmed: z.literal(true, {
    error: "Confirm that these are your contact details.",
  }),
  ip: z.string().max(45).optional(),
});
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function bookingDate(value: string) {
  const date = new Date(`${value}T00:00:00+05:30`);
  const today = shopDate();
  const last = shopDate(new Date(Date.now() + 30 * 86400000));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    shopDate(date) !== value ||
    value < today ||
    value > last
  )
    throw new BusinessError("Choose a date within the next 30 days.", "VALIDATION_ERROR");
  return value;
}

export async function publicBookingInfo(
  token: string,
  rawDate: string,
  doctorId?: string,
) {
  if (!tokenSchema.safeParse(token).success) return null;
  const link = await db().publicBookingLink.findFirst({
    where: { token, active: true, branch: { active: true, demo: false } },
    select: {
      branchId: true,
      branch: { select: { name: true, address: true, phone: true } },
    },
  });
  if (!link) return null;
  const date = bookingDate(rawDate);
  const doctors = await db().doctor.findMany({
    where: { branchId: link.branchId, active: true },
    select: {
      id: true,
      name: true,
      specialization: true,
      feePaise: true,
      slotMinutes: true,
      availability: true,
    },
    orderBy: { name: "asc" },
    take: 100,
  });
  const doctor = doctors.find((d) => d.id === doctorId) ?? doctors[0];
  if (!doctor)
    return { shop: link.branch, doctors: [], doctor: null, slots: [], date };
  const slots = slotsForDay(date, doctor.availability, doctor.slotMinutes);
  const occupied = slots.length
    ? await db().appointment.findMany({
        where: {
          doctorId: doctor.id,
          status: { not: "CANCELLED" },
          startsAt: { lt: slots.at(-1)!.endsAt },
          endsAt: { gt: slots[0].startsAt },
        },
        select: { startsAt: true, endsAt: true },
      })
    : [];
  return {
    shop: link.branch,
    doctors,
    doctor,
    date,
    slots: slots.filter(
      (slot) => !occupied.some((other) => overlaps(slot, other)),
    ),
  };
}

/** Shared DB limits survive process restarts and don't trust forwarded IP headers. */
async function consumeLimit(scope: string, maximum: number) {
  const key = digest(`public-booking:${scope}`);
  const now = new Date(),
    resetsAt = new Date(now.getTime() + 3600000);
  return transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO LoginAttempt (\`key\`, attempts, resetsAt) VALUES (${key},0,${resetsAt}) ON DUPLICATE KEY UPDATE \`key\`=\`key\``;
    const [current] = await tx.$queryRaw<
      LoginAttempt[]
    >`SELECT * FROM LoginAttempt WHERE \`key\`=${key} FOR UPDATE`;
    if (current.resetsAt > now && current.attempts >= maximum) return false;
    if (current.resetsAt <= now)
      await tx.$executeRaw`UPDATE LoginAttempt SET attempts=1,resetsAt=${resetsAt} WHERE \`key\`=${key}`;
    else
      await tx.$executeRaw`UPDATE LoginAttempt SET attempts=attempts+1 WHERE \`key\`=${key}`;
    return true;
  });
}

export async function requestPublicBooking(raw: unknown) {
  const input = publicBookingSchema.parse(raw);
  bookingDate(shopDate(new Date(input.startsAt)));
  const link = await db().publicBookingLink.findFirst({
    where: {
      token: input.token,
      active: true,
      branch: { active: true, demo: false },
    },
    select: { branchId: true },
  });
  if (!link)
    throw new BusinessError(
      "This booking link is unavailable. Contact the shop.",
      "NOT_FOUND",
    );
  const requestId = `public:${digest(`${input.token}:${input.operationId}`)}`;
  const fingerprint = digest(
    JSON.stringify([input.doctorId, input.startsAt, input.name, input.phone]),
  );
  const notes = `Public booking request - phone not verified. Name given: ${input.name}. Reference: ${fingerprint}`;
  const committed = await db().appointment.findUnique({
    where: { operationId: requestId },
  });
  if (committed) {
    if (
      committed.notes !== notes ||
      committed.branchId !== link.branchId ||
      committed.doctorId !== input.doctorId
    )
      throw new BusinessError(
        "This request changed. Reload the booking page before trying again.",
        "CONFLICT",
      );
    if (committed.status === "CANCELLED")
      throw new BusinessError(
        "This request was cancelled. Reload the page to make a new booking.",
        "EXPIRED",
      );
    return committed.id;
  }
  const clientIp = input.ip ?? "unknown";
  // Rate limit by IP (10 requests/hour) and by phone per branch (5/hour) and global per branch (200/hour)
  if (
    !(await consumeLimit(`${link.branchId}:ip:${clientIp}`, 10)) ||
    !(await consumeLimit(`${link.branchId}:phone:${input.phone}`, 5)) ||
    !(await consumeLimit(link.branchId, 200))
  )
    throw new BusinessError(
      "Too many booking attempts. Please call the shop or try again in one hour.",
      "RATE_LIMITED",
    );
  return transaction(async (tx) => {
    const [branch] = await tx.$queryRaw<
      { active: boolean; demo: boolean }[]
    >`SELECT active,demo FROM Branch WHERE id=${link.branchId} FOR UPDATE`;
    const [current] = await tx.$queryRaw<
      PublicBookingLink[]
    >`SELECT * FROM PublicBookingLink WHERE branchId=${link.branchId} FOR UPDATE`;
    if (
      !branch?.active ||
      branch.demo ||
      !current?.active ||
      current.token !== input.token
    )
      throw new BusinessError(
        "This booking link is unavailable. Contact the shop.",
      );
    const [doctor] = await tx.$queryRaw<
      Doctor[]
    >`SELECT * FROM Doctor WHERE id=${input.doctorId} AND branchId=${link.branchId} FOR UPDATE`;
    if (!doctor?.active)
      throw new BusinessError(
        "This doctor is unavailable. Choose another doctor.",
      );
    const [previous] = await tx.$queryRaw<
      Appointment[]
    >`SELECT * FROM Appointment WHERE operationId=${requestId} FOR UPDATE`;
    if (previous) {
      if (
        previous.notes !== notes ||
        previous.branchId !== link.branchId ||
        previous.doctorId !== doctor.id
      )
        throw new BusinessError(
          "This request changed. Reload the booking page before trying again.",
        );
      if (previous.status === "CANCELLED")
        throw new BusinessError(
          "This request was cancelled. Reload the page to make a new booking.",
        );
      return previous.id;
    }
    const availability = await tx.$queryRaw<
      { weekday: number; startMinute: number; endMinute: number }[]
    >`SELECT weekday,startMinute,endMinute FROM DoctorAvailability WHERE doctorId=${doctor.id} FOR UPDATE`;
    const startsAt = new Date(input.startsAt);
    const slot = slotsForDay(
      shopDate(startsAt),
      availability,
      doctor.slotMinutes,
    ).find((s) => s.startsAt.getTime() === startsAt.getTime());
    if (!slot)
      throw new BusinessError(
        "That time is no longer available. Choose another time.",
      );
    const occupied = await tx.$queryRaw<
      Appointment[]
    >`SELECT * FROM Appointment WHERE doctorId=${doctor.id} AND startsAt < ${slot.endsAt} AND endsAt > ${slot.startsAt} AND status <> 'CANCELLED' FOR UPDATE`;
    if (occupied.length)
      throw new BusinessError("That slot was just taken. Choose another time.");
    let [customer] = await tx.$queryRaw<
      { id: string; active: boolean }[]
    >`SELECT id,active FROM Customer WHERE branchId=${link.branchId} AND phone=${input.phone} FOR UPDATE`;
    if (customer && !customer.active)
      throw new BusinessError("Please call the shop to book this appointment.");
    if (!customer)
      customer = await tx.customer.create({
        data: { branchId: link.branchId, name: input.name, phone: input.phone },
      });
    // Public contact entry isn't verified consent. Never overwrite an existing customer's name/preferences or queue SMS here.
    const appointment = await tx.appointment.create({
      data: {
        branchId: link.branchId,
        doctorId: doctor.id,
        customerId: customer.id,
        operationId: requestId,
        ...slot,
        notes,
      },
    });
    await tx.auditLog.create({
      data: {
        branchId: link.branchId,
        userId: "public-booking",
        action: "PUBLIC_BOOKING",
        entity: "Appointment",
        entityId: appointment.id,
        after: { doctorId: doctor.id, startsAt: input.startsAt },
      },
    });
    return appointment.id;
  });
}
