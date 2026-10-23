"use server";
import type { FormState } from "@/components/shared/action-form";
import { saveResult, text, number } from "@/server/forms";
import { returnSale } from "./returns";
export async function returnAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      returnSale({
        saleId: text(form, "saleId"),
        operationId: text(form, "operationId"),
        reason: text(form, "reason"),
        refundMethod: text(form, "refundMethod"),
        void: form.get("void") === "on",
        items: form
          .getAll("saleItemId")
          .map((id) => ({
            saleItemId: String(id),
            quantity: number(form, `quantity:${id}`),
          }))
          .filter((i) => i.quantity > 0),
      }),
    [
      "/bills",
      "/stock",
      "/dashboard",
      "/customers",
      `/bills/${text(form, "saleId")}`,
    ],
    "Return recorded. Check the refund breakdown below before paying the customer.",
  );
}
