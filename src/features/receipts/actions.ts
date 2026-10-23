"use server";
import { saveResult } from "@/server/forms";
import { shareReceipt, revokeReceipts } from "./service";
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
