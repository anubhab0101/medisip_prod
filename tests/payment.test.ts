import { describe, it, expect } from "vitest";
import {
  preparePayment,
  initialPayment,
} from "../src/features/billing/payment";
describe("cash and split payments", () => {
  it("records only the bill amount and calculates change separately", () => {
    const result = preparePayment(
      { ...initialPayment, cashReceived: "200" },
      12300,
    );
    expect(result.changePaise).toBe(7700);
    expect(result.payments[0].amountPaise).toBe(12300);
  });
  it("splits the exact balance to credit", () => {
    const result = preparePayment(
      {
        ...initialPayment,
        method: "SPLIT",
        firstAmount: "25.50",
        secondMethod: "CREDIT",
      },
      10000,
    );
    expect(result.payments.map((p) => p.amountPaise)).toEqual([2550, 7450]);
  });
  it("rejects underpayment and excessive split amounts", () => {
    expect(() =>
      preparePayment({ ...initialPayment, cashReceived: "1" }, 1000),
    ).toThrow("less than");
    expect(() =>
      preparePayment(
        { ...initialPayment, method: "SPLIT", firstAmount: "11" },
        1000,
      ),
    ).toThrow("between");
  });
});
