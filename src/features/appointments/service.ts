import "server-only";
import { z } from "zod";
import {
  AppointmentStatus,
  type Doctor,
  type Appointment,
} from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { id, name, operationId, paise } from "@/lib/validation";
import { shopDate } from "@/lib/date";
import { slotsForDay, overlaps } from "./slots";
import { createJob } from "@/server/jobs/queue";
export const doctorSchema = z
  .object({
    name,
    specialization: z.string().trim().min(1).max(150),
    feePaise: paise,
    slotMinutes: z.number().int().min(5).max(240),
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine(
    (d) => d.endMinute > d.startMinute,
    "End time must be after start time.",
  );
export async function createDoctor(raw: unknown) {
  const ctx = await context(Permission.APPOINTMENT);
  const { weekday, startMinute, endMinute, ...data } = doctorSchema.parse(raw);
  return transaction(
    async (tx) =>
      (
        await tx.doctor.create({
          data: {
            branchId: ctx.branch.id,
            ...data,
            availability: { create: { weekday, startMinute, endMinute } },
          },
        })
      ).id,
  );
}
const bookingSchema = z.object({
  doctorId: id,
  customerId: id,
  operationId,
  startsAt: z.string().datetime(),
  notes: z.string().trim().max(1000).default(""),
});
export async function bookAppointment(raw: unknown) {
  const ctx = await context(Permission.APPOINTMENT);
  const input = bookingSchema.parse(raw);
  return transaction(async (tx) => {
    const [doctor] = await tx.$queryRaw<
      Doctor[]
    >`SELECT * FROM Doctor WHERE id=${input.doctorId} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!doctor?.active)
      throw new BusinessError("Choose an active doctor in this shop.");
    const previous = await tx.appointment.findUnique({
      where: { operationId: input.operationId },
    });
    if (previous) {
      if (previous.branchId !== ctx.branch.id)
        throw new BusinessError("This request belongs to another shop.");
      return previous.id;
    }
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, branchId: ctx.branch.id, active: true },
    });
    if (!customer) throw new BusinessError("Choose a customer in this shop.");
    const availability = await tx.doctorAvailability.findMany({
      where: { doctorId: doctor.id },
    });
    const startsAt = new Date(input.startsAt);
    const slot = slotsForDay(
      shopDate(startsAt),
      availability,
      doctor.slotMinutes,
    ).find((s) => s.startsAt.getTime() === startsAt.getTime());
    if (!slot)
      throw new BusinessError(
        "This time is outside the doctor’s available hours or is in the past.",
      );
    const booked = await tx.$queryRaw<
      Appointment[]
    >`SELECT * FROM Appointment WHERE doctorId=${doctor.id} AND startsAt < ${slot.endsAt} AND endsAt > ${slot.startsAt} AND status <> 'CANCELLED' FOR UPDATE`;
    if (booked.some((b) => overlaps(slot, b)))
      throw new BusinessError("That slot was just taken. Choose another time.");
    const appointment = await tx.appointment.create({
      data: {
        branchId: ctx.branch.id,
        doctorId: doctor.id,
        customerId: customer.id,
        operationId: input.operationId,
        ...slot,
        notes: input.notes,
      },
    });
    if (customer.consentSms && !ctx.branch.demo) {
      for (const [type, when] of [
        ["APPOINTMENT_CONFIRMATION", new Date()],
        ["APPOINTMENT_REMINDER_24H", new Date(startsAt.getTime() - 86400000)],
        ["APPOINTMENT_REMINDER_2H", new Date(startsAt.getTime() - 7200000)],
      ] as const) {
        if (type !== "APPOINTMENT_CONFIRMATION" && when < new Date()) continue;
        await createJob(
          `${type}:${appointment.id}`,
          type,
          {
            branchId: ctx.branch.id,
            customerId: customer.id,
            appointmentId: appointment.id,
          },
          when,
        );
      }
    }
    return appointment.id;
  });
}
export async function changeAppointment(raw: unknown) {
  const ctx = await context(Permission.APPOINTMENT);
  const input = z
    .object({ id, status: z.nativeEnum(AppointmentStatus) })
    .parse(raw);
  return transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { id: input.id, branchId: ctx.branch.id },
    });
    if (!appointment) throw new BusinessError("Appointment not found.");
    await tx.$queryRaw`SELECT id FROM Doctor WHERE id=${appointment.doctorId} FOR UPDATE`;
    const [current] = await tx.$queryRaw<
      Appointment[]
    >`SELECT * FROM Appointment WHERE id=${appointment.id} FOR UPDATE`;
    if (
      current.status === AppointmentStatus.CANCELLED &&
      input.status !== AppointmentStatus.CANCELLED
    )
      throw new BusinessError(
        "Cancelled appointments cannot be reopened. Book a new slot instead.",
      );
    await tx.appointment.updateMany({
      where: { id: input.id, branchId: ctx.branch.id },
      data: { status: input.status },
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "STATUS",
        entity: "Appointment",
        entityId: input.id,
        after: { status: input.status },
      },
    });
  });
}
