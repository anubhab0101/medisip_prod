"use server";
import { editMedicine, archiveMedicine } from "./edit";
import { addMedicine, receivePurchase, adjustStock } from "./service";
import { saveResult, text, number } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
import { parseMoney } from "@/lib/money";
export async function medicineAction(_state: FormState, form: FormData) {
  return saveResult(
    () => addMedicine(medicineInput(form)),
    ["/medicines", "/dashboard", "/settings/setup"],
    "Medicine added. You can now add its stock.",
  );
}
export async function purchaseAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      receivePurchase({
        orderId: text(form, "orderId") || undefined,
        operationId: text(form, "operationId"),
        supplierId: text(form, "supplierId"),
        invoiceNo: text(form, "invoiceNo"),
        date: text(form, "date"),
        items: form.getAll("medicineId").map((medicineId, index) => ({
          medicineId: String(medicineId),
          batchNo: String(form.getAll("batchNo")[index] ?? ""),
          expiryMonth: String(form.getAll("expiryMonth")[index] ?? ""),
          quantity: Number(form.getAll("quantity")[index]),
          unitCostPaise: parseMoney(String(form.getAll("cost")[index] ?? "")),
          mrpPaise: parseMoney(String(form.getAll("mrp")[index] ?? "")),
        })),
      }),
    [
      "/purchases",
      "/purchases/orders",
      "/stock",
      "/medicines",
      "/dashboard",
      "/settings/setup",
    ],
    "Purchase saved and stock updated.",
  );
}
export async function adjustmentAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      adjustStock({
        type: text(form, "type") || "ADJUST",
        batchId: text(form, "batchId"),
        quantity: number(form, "quantity"),
        reason: text(form, "reason"),
        operationId: text(form, "operationId"),
      }),
    ["/stock", "/medicines", "/dashboard"],
    "Stock adjustment saved.",
  );
}

function medicineInput(form: FormData) {
  return {
    name: text(form, "name"),
    genericName: text(form, "genericName"),
    strength: text(form, "strength"),
    dosageForm: text(form, "dosageForm"),
    manufacturer: text(form, "manufacturer"),
    hsn: text(form, "hsn"),
    gstBasisPoints: number(form, "gstBasisPoints"),
    packSize: text(form, "packSize"),
    barcode: text(form, "barcode"),
    schedule: text(form, "schedule"),
    reorderLevel: number(form, "reorderLevel"),
    rack: text(form, "rack"),
  };
}

export async function editMedicineAction(_state: FormState, form: FormData) {
  return saveResult(
    () => editMedicine({ ...medicineInput(form), id: text(form, "id") }),
    ["/medicines", "/stock", "/billing"],
    "Medicine updated. Existing invoices keep their original details.",
  );
}
export async function archiveMedicineAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      archiveMedicine({
        id: text(form, "id"),
        active: text(form, "active") === "true",
        confirmed: form.get("confirmed") === "on",
      }),
    ["/medicines", "/billing", "/stock"],
    "Medicine availability updated for this shop.",
  );
}
