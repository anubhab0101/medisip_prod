"use server";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
import { createDelivery, updateDelivery } from "./service";
export async function createDeliveryAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      createDelivery({
        saleId: text(form, "saleId"),
        address: text(form, "address"),
        phone: text(form, "phone"),
        assignedTo: text(form, "assignedTo"),
        notes: text(form, "notes"),
      }),
    ["/deliveries", "/bills"],
    "Delivery added. Track it from Deliveries.",
  );
}
export async function updateDeliveryAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      updateDelivery({
        id: text(form, "id"),
        status: text(form, "status"),
        assignedTo: text(form, "assignedTo"),
        notes: text(form, "notes"),
        confirmed: form.get("confirmed") === "on",
      }),
    ["/deliveries"],
    "Delivery updated.",
  );
}
