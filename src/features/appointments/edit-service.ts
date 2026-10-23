import "server-only";
import { z } from "zod";
import { type Doctor, type Appointment } from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission, can } from "@/lib/permissions";
import { id, name, paise } from "@/lib/validation";
import { BusinessError } from "@/lib/errors";
import { shopDate } from "@/lib/date";
import { slotsForDay } from "./slots";
const windowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine(
    (w) => w.startMinute < w.endMinute,
    "End time must follow start time.",
  );
export async function editDoctor(raw: unknown) {
  const ctx = await context(Permission.APPOINTMENT);
  const input = z
    .object({
      id,
      name,
      specialization: z.string().trim().min(1).max(150),
      feePaise: paise,
      slotMinutes: z.number().int().min(5).max(240),
      active: z.boolean(),
      userId: z.string().max(100),
      windows: z.array(windowSchema).min(1).max(28),
    })
    .parse(raw);
  for (let i = 0; i < input.windows.length; i++)
    for (let j = i + 1; j < input.windows.length; j++) {
      const a = input.windows[i],
        b = input.windows[j];
      if (
        a.weekday === b.weekday &&
        a.startMinute < b.endMinute &&
        b.startMinute < a.endMinute
      )
        throw new BusinessError("Doctor hours cannot overlap on the same day.");
    }
  return transaction(async (tx) => {
    const [doctor] = await tx.$queryRaw<
      Doctor[]
    >`SELECT * FROM Doctor WHERE id=${input.id} AND branchId=${ctx.branch.id} FOR UPDATE`;
    if (!doctor) throw new BusinessError("Doctor not found.");
    if (input.userId !== (doctor.userId ?? "")) {
      if (!can(ctx.role, Permission.USERS))
        throw new BusinessError("Only the owner can link a doctor login.");
      if (
        input.userId &&
        !(await tx.membership.findFirst({
          where: {
            branchId: ctx.branch.id,
            userId: input.userId,
            role: "DOCTOR",
            user: { active: true },
          },
        }))
      )
        throw new BusinessError(
          "Choose an active doctor account in this shop.",
        );
    }
    const bookings = await tx.$queryRaw<
      Appointment[]
    >`SELECT * FROM Appointment WHERE doctorId=${doctor.id} AND startsAt>${new Date()} AND status IN ('BOOKED','CONFIRMED') FOR UPDATE`;
    if (
      bookings.some(
        (b) =>
          !input.active ||
          !slotsForDay(
            shopDate(b.startsAt),
            input.windows,
            input.slotMinutes,
          ).some(
            (s) =>
              s.startsAt.getTime() === b.startsAt.getTime() &&
              s.endsAt.getTime() === b.endsAt.getTime(),
          ),
      )
    )
      throw new BusinessError(
        "Existing future appointments would fall outside these hours. Reschedule or cancel those appointments first.",
      );
    await tx.doctor.update({
      where: { id: doctor.id },
      data: {
        name: input.name,
        specialization: input.specialization,
        feePaise: input.feePaise,
        slotMinutes: input.slotMinutes,
        active: input.active,
        userId: input.userId || null,
      },
    });
    await tx.doctorAvailability.deleteMany({ where: { doctorId: doctor.id } });
    await tx.doctorAvailability.createMany({
      data: input.windows.map((w) => ({ ...w, doctorId: doctor.id })),
    });
    await tx.auditLog.create({
      data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "EDIT_DOCTOR",
        entity: "Doctor",
        entityId: doctor.id,
        after: input,
      },
    });
    return doctor.id;
  });
}
