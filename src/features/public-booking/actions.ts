"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
import { requestPublicBooking } from "./service";
import { headers } from "next/headers";

async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function publicBookingAction(_state: FormState, form: FormData) {
  const ip = await getClientIp();
  return saveResult(
    () =>
      requestPublicBooking({
        token: text(form, "token"),
        doctorId: text(form, "doctorId"),
        operationId: text(form, "operationId"),
        startsAt: text(form, "startsAt"),
        name: text(form, "name"),
        phone: text(form, "phone"),
        confirmed: form.get("confirmed") === "on",
        ip,
      }),
    ["/appointments"],
    "Booking received. Please contact the shop to confirm your visit. No payment has been taken.",
  );
}

export async function bookingLinkAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.SETTINGS);
      if (ctx.branch.demo)
        throw new BusinessError(
          "Public booking is disabled in practice shops.",
        );
      const command = text(form, "command");
      if (
        !["enable", "disable", "replace"].includes(command) ||
        form.get("confirmed") !== "on"
      )
        throw new BusinessError("Confirm the booking-link change.");
      await transaction(async (tx) => {
        const branches = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM Branch WHERE id=${ctx.branch.id} AND active=1 AND demo=0 FOR UPDATE`;
        if (!branches.length)
          throw new BusinessError(
            "This shop is no longer available for public booking.",
          );
        const [member] = await tx.$queryRaw<
          { role: string }[]
        >`SELECT role FROM Membership WHERE userId=${ctx.user.id} AND branchId=${ctx.branch.id} FOR UPDATE`;
        if (member?.role !== "OWNER")
          throw new BusinessError("Only the owner can change public booking.");
        const current = await tx.publicBookingLink.findUnique({
          where: { branchId: ctx.branch.id },
        });
        await tx.publicBookingLink.upsert({
          where: { branchId: ctx.branch.id },
          create: {
            branchId: ctx.branch.id,
            token: randomBytes(32).toString("base64url"),
            active: command !== "disable",
          },
          update: {
            active: command !== "disable",
            ...(command === "replace"
              ? { token: randomBytes(32).toString("base64url") }
              : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            branchId: ctx.branch.id,
            userId: ctx.user.id,
            action: "BOOKING_LINK",
            entity: "Branch",
            entityId: ctx.branch.id,
            before: { active: current?.active ?? false },
            after: {
              active: command !== "disable",
              replaced: command === "replace",
            },
          },
        });
      });
      revalidatePath("/appointments/booking-link");
    },
    ["/appointments"],
    "Booking link updated.",
  );
}
