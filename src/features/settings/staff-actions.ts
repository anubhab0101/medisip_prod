"use server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { Role } from "@prisma/client";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { id, name } from "@/lib/validation";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
export async function staffAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.USERS);
      const input = z
        .object({
          name,
          email: z
            .string()
            .email()
            .max(191)
            .transform((s) => s.toLowerCase()),
          password: z
            .string()
            .min(12)
            .refine(
              (s) => Buffer.byteLength(s, "utf8") <= 72,
              "Password must be at most 72 bytes.",
            ),
          role: z.nativeEnum(Role),
        })
        .parse({
          name: text(form, "name"),
          email: text(form, "email"),
          password: text(form, "password"),
          role: text(form, "role"),
        });
      const passwordHash = await hash(input.password, 12);
      return transaction(async (tx) => {
        if (await tx.user.findUnique({ where: { email: input.email } }))
          throw new BusinessError(
            "This email already has an account. Use a different email for new staff.",
          );
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash,
            memberships: {
              create: { branchId: ctx.branch.id, role: input.role },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            branchId: ctx.branch.id,
            userId: ctx.user.id,
            action: "ADD_STAFF",
            entity: "User",
            entityId: user.id,
            after: { role: input.role },
          },
        });
        return user.id;
      });
    },
    ["/settings/staff"],
    "Staff account created.",
  );
}
export async function accessAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.USERS);
      const input = z
        .object({ userId: id, role: z.nativeEnum(Role), remove: z.boolean() })
        .parse({
          userId: text(form, "userId"),
          role: text(form, "role"),
          remove: form.get("remove") === "on",
        });
      if (input.userId === ctx.user.id)
        throw new BusinessError("You cannot change your own shop access here.");
      return transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Branch WHERE id=${ctx.branch.id} FOR UPDATE`;
        const member = await tx.membership.findUnique({
          where: {
            userId_branchId: { userId: input.userId, branchId: ctx.branch.id },
          },
        });
        if (!member)
          throw new BusinessError("Staff member not found in this shop.");
        if (input.remove)
          await tx.membership.delete({
            where: {
              userId_branchId: {
                userId: input.userId,
                branchId: ctx.branch.id,
              },
            },
          });
        else
          await tx.membership.update({
            where: {
              userId_branchId: {
                userId: input.userId,
                branchId: ctx.branch.id,
              },
            },
            data: { role: input.role },
          });
        await tx.auditLog.create({
          data: {
            branchId: ctx.branch.id,
            userId: ctx.user.id,
            action: input.remove ? "REMOVE_ACCESS" : "CHANGE_ROLE",
            entity: "User",
            entityId: input.userId,
            after: { role: input.role },
          },
        });
      });
    },
    ["/settings/staff"],
    "Shop access updated.",
  );
}
export async function branchAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.SETTINGS);
      const input = z
        .object({
          name,
          address: z.string().trim().min(5).max(1000),
          phone: z.string().trim().min(10).max(20),
          demo: z.boolean(),
        })
        .parse({
          name: text(form, "name"),
          address: text(form, "address"),
          phone: text(form, "phone"),
          demo: form.get("demo") === "on",
        });
      return transaction(
        async (tx) =>
          (
            await tx.branch.create({
              data: {
                ...input,
                memberships: {
                  create: { userId: ctx.user.id, role: Role.OWNER },
                },
              },
            })
          ).id,
      );
    },
    ["/settings", "/dashboard"],
    "Shop added. Use the shop selector to switch.",
  );
}
