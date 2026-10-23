import { describe, it, expect } from "vitest";
import { calculateBill } from "../src/features/billing/pricing";
import { can, Permission } from "../src/lib/permissions";
import { expiryFromMonth, financialYear, shopDate } from "../src/lib/date";
import { allocateFefo } from "../src/lib/fefo";
describe("bill-level reconciliation", () => {
  it("allocates discount once and reconciles tax", () => {
    const bill = calculateBill(
      [
        {
          unitPricePaise: 11200,
          quantity: 1,
          gstBasisPoints: 1200,
          discountBasisPoints: 0,
        },
        {
          unitPricePaise: 10500,
          quantity: 1,
          gstBasisPoints: 500,
          discountBasisPoints: 0,
        },
      ],
      101,
    );
    expect(bill.discountPaise).toBe(101);
    expect(
      bill.taxablePaise + bill.cgstPaise + bill.sgstPaise + bill.roundOffPaise,
    ).toBe(bill.totalPaise);
    expect(bill.totalPaise).toBe(21600);
  });
  it("rejects excessive discounts", () =>
    expect(() =>
      calculateBill(
        [
          {
            unitPricePaise: 100,
            quantity: 1,
            gstBasisPoints: 0,
            discountBasisPoints: 0,
          },
        ],
        101,
      ),
    ).toThrow());
  it("allows a free bill without division by zero", () =>
    expect(
      calculateBill(
        [
          {
            unitPricePaise: 0,
            quantity: 1,
            gstBasisPoints: 1200,
            discountBasisPoints: 0,
          },
        ],
        0,
      ).totalPaise,
    ).toBe(0));
  it("keeps every paise across multiple discounted lines", () => {
    for (let discount = 0; discount <= 30; discount++) {
      const bill = calculateBill(
        [1, 2, 3].map((n) => ({
          unitPricePaise: n * 5,
          quantity: 1,
          gstBasisPoints: 1800,
          discountBasisPoints: 0,
        })),
        discount,
      );
      expect(bill.lines.reduce((n, l) => n + l.totalPaise, 0)).toBe(
        30 - discount,
      );
    }
  });
});
describe("permissions", () => {
  it("cashiers cannot change stock or settings", () => {
    expect(can("CASHIER", Permission.BILL)).toBe(true);
    expect(can("CASHIER", Permission.STOCK_WRITE)).toBe(false);
    expect(can("CASHIER", Permission.SETTINGS)).toBe(false);
  });
  it("doctors cannot access shop billing or reports", () => {
    expect(can("DOCTOR", Permission.BILL)).toBe(false);
    expect(can("DOCTOR", Permission.REPORT)).toBe(false);
    expect(can("DOCTOR", Permission.DOCTOR_OWN)).toBe(true);
  });
});
describe("shop dates", () => {
  it("resolves month expiry including leap years", () => {
    expect(expiryFromMonth("2028-02").toISOString().slice(0, 10)).toBe(
      "2028-02-29",
    );
    expect(expiryFromMonth("2027-02").toISOString().slice(0, 10)).toBe(
      "2027-02-28",
    );
  });
  it("handles the Indian financial-year boundary", () => {
    expect(financialYear(new Date("2026-03-31T18:29:59Z"))).toBe("2025-26");
    expect(financialYear(new Date("2026-03-31T18:30:00Z"))).toBe("2026-27");
    expect(shopDate(new Date("2026-10-07T20:00:00Z"))).toBe("2026-10-08");
  });
  it("permits stock through its expiry day, not the following day", () => {
    const batch = [{ id: "a", expiryDate: "2026-10-31", qtyOnHand: 1 }];
    expect(allocateFefo(batch, 1, "2026-10-31")).toHaveLength(1);
    expect(() => allocateFefo(batch, 1, "2026-11-01")).toThrow();
  });
});
