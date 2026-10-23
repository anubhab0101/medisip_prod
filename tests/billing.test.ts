import { describe, expect, it } from "vitest";
import { parseMoney, formatMoney } from "../src/lib/money";
import { calculateLine, roundBill } from "../src/lib/gst";
import { allocateFefo } from "../src/lib/fefo";
describe("integer-paise billing", () => {
  it("parses decimal input exactly", () => {
    expect(parseMoney("19.05")).toBe(1905);
    expect(formatMoney(1905)).toBe("₹19.05");
  });
  it.each(["-1", "1.005", "NaN", "1e2", "9007199254740992"])(
    "rejects invalid money %s",
    (value) => expect(() => parseMoney(value)).toThrow(),
  );
  it("extracts inclusive GST after discount", () =>
    expect(calculateLine(11200, 2, 1200, 1000)).toEqual({
      grossPaise: 22400,
      discountPaise: 2240,
      taxablePaise: 18000,
      cgstPaise: 1080,
      sgstPaise: 1080,
      totalPaise: 20160,
    }));
  it("reconciles odd tax paise", () => {
    const line = calculateLine(105, 1, 500);
    expect(line.taxablePaise + line.cgstPaise + line.sgstPaise).toBe(105);
  });
  it("supports full discounts and zero tax", () => {
    expect(calculateLine(100, 1, 0).totalPaise).toBe(100);
    expect(calculateLine(100, 1, 500, 10000).totalPaise).toBe(0);
  });
  it("rejects invalid quantities and unsafe totals", () => {
    expect(() => calculateLine(100, 0, 500)).toThrow();
    expect(() => calculateLine(Number.MAX_SAFE_INTEGER, 2, 500)).toThrow();
  });
  it("rounds only the final bill", () => {
    expect(roundBill(20160)).toEqual({ totalPaise: 20200, roundOffPaise: 40 });
    expect(roundBill(20149).totalPaise).toBe(20100);
  });
});
describe("FEFO", () => {
  const batches = [
    { id: "late", expiryDate: "2027-01-01", qtyOnHand: 5 },
    { id: "early", expiryDate: "2026-11-01", qtyOnHand: 2 },
    { id: "expired", expiryDate: "2026-10-07", qtyOnHand: 100 },
  ];
  it("splits earliest first without mutating stock", () => {
    expect(allocateFefo(batches, 4, "2026-10-08")).toEqual([
      { batchId: "early", quantity: 2 },
      { batchId: "late", quantity: 2 },
    ]);
    expect(batches[1].qtyOnHand).toBe(2);
  });
  it("excludes expired stock", () =>
    expect(() => allocateFefo(batches, 8, "2026-10-08")).toThrow("Not enough"));
  it("rejects duplicates and impossible dates", () => {
    expect(() =>
      allocateFefo([batches[0], batches[0]], 1, "2026-10-08"),
    ).toThrow();
    expect(() => allocateFefo(batches, 1, "2026-02-30")).toThrow();
  });
});
