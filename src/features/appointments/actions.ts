"use server";
import { z } from "zod";
import { createDoctor, bookAppointment, changeAppointment } from "./service";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { id } from "@/lib/validation";
import { saveResult, text, number } from "@/server/forms";
import { parseMoney } from "@/lib/money";
import { slotsForDay, overlaps } from "./slots";
import type { FormState } from "@/components/shared/action-form";
function minute(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
export async function doctorAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      createDoctor({
        name: text(form, "name"),
        specialization: text(form, "specialization"),
        feePaise: parseMoney(text(form, "fee")),
        slotMinutes: number(form, "slotMinutes"),
        weekday: number(form, "weekday"),
        startMinute: minute(text(form, "start")),
        endMinute: minute(text(form, "end")),
      }),
    ["/appointments"],
    "Doctor added.",
  );
}
export async function bookingAction(raw: unknown) {
  return saveResult(
    () => bookAppointment(raw),
    ["/appointments", "/dashboard"],
    "Appointment booked.",
  );
}
export async function statusAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      changeAppointment({ id: text(form, "id"), status: text(form, "status") }),
    ["/appointments"],
    "Appointment updated.",
  );
}
export async function availableSlots(raw: unknown) {
  const ctx = await context(Permission.APPOINTMENT);
  const input = z
    .object({ doctorId: id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .parse(raw);
  const doctor = await db().doctor.findFirst({
    where: { id: input.doctorId, branchId: ctx.branch.id, active: true },
    include: { availability: true },
  });
  if (!doctor) return [];
  const slots = slotsForDay(
    input.date,
    doctor.availability,
    doctor.slotMinutes,
  );
  if (!slots.length) return [];
  const booked = await db().appointment.findMany({
    where: {
      doctorId: doctor.id,
      status: { not: "CANCELLED" },
      startsAt: { lt: slots[slots.length - 1].endsAt },
      endsAt: { gt: slots[0].startsAt },
    },
  });
  return slots
    .filter((s) => !booked.some((b) => overlaps(s, b)))
    .map((s) => ({
      startsAt: s.startsAt.toISOString(),
      label: new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
      }).format(s.startsAt),
    }));
}
