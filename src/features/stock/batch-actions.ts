"use server";
import { saveResult, text } from "@/server/forms";
import { parseMoney } from "@/lib/money";
import type { FormState } from "@/components/shared/action-form";
import { editBatch } from "./batch-service";
export async function batchAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      editBatch({
        id: text(form, "id"),
        batchNo: text(form, "batchNo"),
        expiryMonth: text(form, "expiryMonth"),
        mrpPaise: parseMoney(text(form, "mrp")),
        purchasePricePaise: parseMoney(text(form, "cost")),
        reason: text(form, "reason"),
        confirmed: form.get("confirmed") === "on",
      }),
    ["/stock", "/billing", "/medicines"],
    "Batch updated. Existing bills keep their original details.",
  );
}
