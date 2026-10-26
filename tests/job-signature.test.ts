import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  signJobPayload,
  validateSignedJob,
} from "../src/lib/job-signature";

describe("job payload signatures", () => {
  it("survives database JSON key reordering and rejects changed values", () => {
    const created = {
      branchId: "branch",
      customerId: "customer",
      saleId: "sale",
      receiptShareId: "share",
      nested: { z: 1, a: ["x", { d: true, b: false }] },
    };
    const signature = signJobPayload(created);
    const restored = {
      nested: { a: ["x", { b: false, d: true }], z: 1 },
      receiptShareId: "share",
      customerId: "customer",
      branchId: "branch",
      saleId: "sale",
      _sig: signature,
    };

    expect(validateSignedJob(restored)).toBe(true);
    expect(
      validateSignedJob({ ...restored, saleId: "different-sale" }),
    ).toBe(false);
  });
});
