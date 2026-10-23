import { it, expect } from "vitest";
import { parseCsv, toCsv } from "../src/lib/csv";
import {
  importHeaders,
  parseMedicineRows,
} from "../src/features/stock/import-schema";
it("reads quoted commas, embedded newlines and escaped quotes", () => {
  expect(
    parseCsv('name,note\r\n"A,B","line1\nline2"\r\n"Say ""Hi""",ok'),
  ).toEqual([
    ["name", "note"],
    ["A,B", "line1\nline2"],
    ['Say "Hi"', "ok"],
  ]);
  expect(() => parseCsv('a,"unclosed')).toThrow("not closed");
});
it("neutralizes spreadsheet formulas in CSV text exports", () => {
  expect(toCsv([["=HYPERLINK(1)", "safe", -5]])).toContain('"\'=HYPERLINK(1)"');
});
it("reports medicine errors by source row and parses tax exactly", () => {
  const row = [
    "Example",
    "Ingredient",
    "500mg",
    "tablet",
    "Maker",
    "",
    "12.50",
    "strip",
    "",
    "NONE",
    "10",
    "A1",
  ];
  const result = parseMedicineRows([importHeaders, row, ["", ...row.slice(1)]]);
  expect(result[0].data?.gstBasisPoints).toBe(1250);
  expect(result[1].row).toBe(3);
  expect(result[1].error).toContain("name");
});
