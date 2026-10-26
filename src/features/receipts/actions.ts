"use server";
import { saveResult } from "@/server/forms";
import { shareReceipt, revokeReceipts } from "./service";
import { queueReceiptDelivery } from "./delivery";
export async function shareReceiptAction(raw: unknown) {
  return saveResult(() => shareReceipt(raw), [], "Receipt-only link ready.");
}
export async function revokeReceiptsAction(saleId: string) {
  return saveResult(
    () => revokeReceipts(saleId),
    [],
    "All shared links for this bill are disabled.",
  );
}
export async function queueReceiptDeliveryAction(raw: unknown) {
  return saveResult(
    () => queueReceiptDelivery(raw),
    ["/notifications"],
    "Receipt queued. Check Notifications for its status.",
  );
}
