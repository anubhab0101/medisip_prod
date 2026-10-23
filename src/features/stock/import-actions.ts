"use server";
import { saveResult } from "@/server/forms";
import { importMedicines, previewMedicineImport } from "./import-service";
export async function previewImportAction(rows: unknown) {
  return previewMedicineImport(rows);
}
export async function importAction(raw: unknown) {
  return saveResult(
    () => importMedicines(raw),
    ["/medicines", "/dashboard", "/settings/setup"],
    "Medicines imported. Add opening stock from Purchases.",
  );
}
