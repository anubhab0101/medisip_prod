import { it, expect } from "vitest";
import { draftSchema } from "../src/features/billing/draft";
it("keeps the operation and prescription while discarding cached price details", () => {
  const operationId = "57465b24-eaa6-4b40-a5e2-fd8276db9425";
  const draft = draftSchema.parse({
    version: 2,
    operationId,
    doctorName: "Dr Example",
    prescriptionRef: "RX1",
    cart: [
      {
        medicine: { id: "medicine", name: "Old label", mrpPaise: 1 },
        quantity: 2,
        discountBasisPoints: 0,
        batchId: "",
      },
    ],
  });
  expect(draft.operationId).toBe(operationId);
  expect(draft.cart[0].medicine).toEqual({ id: "medicine" });
  expect(draft.prescriptionRef).toBe("RX1");
});
