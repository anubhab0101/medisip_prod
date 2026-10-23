"use server";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
import { draftOrder, updateOrder } from "./service";
export async function draftOrderAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      draftOrder({
        operationId: text(form, "operationId"),
        supplierId: text(form, "supplierId"),
      }),
    ["/purchases/orders"],
    "Draft created. Open it below to review quantities.",
  );
}
export async function orderAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      updateOrder({
        id: text(form, "id"),
        status: text(form, "status"),
        confirmed: form.get("confirmed") === "on",
        items: form.getAll("medicineId").length
          ? form
              .getAll("medicineId")
              .map((medicineId, i) => ({
                medicineId: String(medicineId),
                name: String(form.getAll("name")[i]),
                quantity: Number(form.getAll("quantity")[i]),
              }))
          : undefined,
      }),
    ["/purchases/orders"],
    "Order updated. No message has been sent to the supplier.",
  );
}
