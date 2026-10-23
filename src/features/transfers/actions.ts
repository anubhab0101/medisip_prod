"use server";
import { saveResult, text, number } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
import { dispatchTransfer, receiveTransfer } from "./service";
export async function dispatchAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      dispatchTransfer({
        operationId: text(form, "operationId"),
        toBranchId: text(form, "toBranchId"),
        batchId: text(form, "batchId"),
        quantity: number(form, "quantity"),
        confirmed: form.get("confirmed") === "on",
      }),
    ["/stock", "/stock/transfers", "/billing"],
    "Dispatched. The receiving shop must confirm arrival.",
  );
}
export async function receiveTransferAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      receiveTransfer({
        id: text(form, "id"),
        confirmed: form.get("confirmed") === "on",
      }),
    ["/stock", "/stock/transfers", "/billing"],
    "Transfer received and stock updated.",
  );
}
