"use server";
import { z } from "zod";
import { context } from "@/server/context";
import { transaction } from "@/server/transaction";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
import { templateBody } from "./template-content";

export async function saveTemplateAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const ctx = await context(Permission.MESSAGES);
      const input = z
        .object({
          id: z.string().max(100),
          key: z.string().trim().min(1).max(100),
          body: templateBody,
          channel: z.enum(["SMS", "WHATSAPP", "EMAIL"]),
          active: z.boolean(),
          promotional: z.boolean(),
        })
        .parse({
          id: text(form, "id"),
          key: text(form, "key"),
          body: text(form, "body"),
          channel: text(form, "channel"),
          active: form.get("active") === "on",
          promotional: form.get("promotional") === "on",
        });
      return transaction(async (tx) => {
        const { id, ...data } = input;
        const before = id
          ? await tx.notificationTemplate.findFirst({
              where: { id, branchId: ctx.branch.id },
            })
          : null;
        if (id && !before)
          throw new BusinessError("Template not found in this shop.");
        const duplicate = await tx.notificationTemplate.findFirst({
          where: {
            branchId: ctx.branch.id,
            key: data.key,
            channel: data.channel,
            ...(id ? { id: { not: id } } : {}),
          },
        });
        if (duplicate)
          throw new BusinessError(
            "A template with this name and channel already exists.",
          );
        const saved = id
          ? await tx.notificationTemplate.update({ where: { id }, data })
          : await tx.notificationTemplate.create({
              data: { ...data, branchId: ctx.branch.id },
            });
        await tx.auditLog.create({
          data: {
            branchId: ctx.branch.id,
            userId: ctx.user.id,
            action: id ? "UPDATE" : "CREATE",
            entity: "NotificationTemplate",
            entityId: saved.id,
            after: data,
            ...(before ? { before } : {}),
          },
        });
        return saved.id;
      });
    },
    ["/notifications/templates", "/notifications"],
    "Template saved. Already prepared messages are unchanged.",
  );
}
