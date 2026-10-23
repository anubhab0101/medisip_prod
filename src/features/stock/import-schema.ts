import { z } from "zod";
import { medicineSchema } from "./schema";
import { parseMoney } from "@/lib/money";
export const importHeaders = [
  "name",
  "genericName",
  "strength",
  "dosageForm",
  "manufacturer",
  "hsn",
  "gstPercent",
  "packSize",
  "barcode",
  "schedule",
  "reorderLevel",
  "rack",
];
export type ImportRow = {
  row: number;
  data?: z.infer<typeof medicineSchema>;
  error: string;
};
export function parseMedicineRows(raw: unknown): ImportRow[] {
  const rows = z
    .array(z.array(z.string().max(1000)).max(30))
    .min(2)
    .max(501)
    .parse(raw);
  const header = rows[0].map((c) => c.trim());
  if (
    importHeaders.some((key) => !header.includes(key)) ||
    new Set(header).size !== header.length
  )
    throw new Error(
      "Use the template headers without renaming or duplicating them.",
    );
  return rows.slice(1).map((cells, index) => {
    try {
      const item = Object.fromEntries(
        header.map((key, i) => [key, (cells[i] ?? "").trim()]),
      );
      const data = medicineSchema.parse({
        ...item,
        gstBasisPoints: parseMoney(item.gstPercent),
        reorderLevel: Number(item.reorderLevel),
        schedule: item.schedule.toUpperCase() || "NONE",
        dosageForm: item.dosageForm || "tablet",
        packSize: item.packSize || "1 strip",
      });
      return { row: index + 2, data, error: "" };
    } catch (error) {
      return {
        row: index + 2,
        error:
          error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : "Check GST percentage and required fields.",
      };
    }
  });
}
