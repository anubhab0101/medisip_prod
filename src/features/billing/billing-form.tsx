"use client";
import { T } from "@/lib/i18n/provider";
import { formatMoney } from "@/lib/money";

import { LoyaltyPicker } from "@/features/loyalty/picker";
import { useEffect, useRef } from "react";
import { MedicineSearch } from "./medicine-search";
import { PaymentFields } from "./payment-fields";
import { CartTable } from "./cart-table";
import { CustomerPicker } from "./customer-picker";
import { HeldBills } from "./held-bills";
import { BillTotals } from "./bill-totals";
import { OcrPanel } from "./ocr-panel";
import type { CatalogItem } from "./types";
import { useBill } from "./use-bill";
export function BillingForm({
  customers,
  branchId,
  userId,
  loyalty,
}: {
  customers: { id: string; name: string; phone: string }[];
  branchId: string;
  userId: string;
  loyalty: { enabled: boolean; rate: number };
}) {
  const bill = useBill(branchId, userId, loyalty.enabled ? loyalty.rate : 0);
  function addMedicine(medicine: CatalogItem) {
    bill.setCart((lines) =>
      lines.some((l) => l.medicine.id === medicine.id)
        ? lines.map((l) =>
            l.medicine.id === medicine.id
              ? { ...l, medicine, quantity: l.quantity + 1 }
              : l,
          )
        : [
            ...lines,
            { medicine, quantity: 1, discountBasisPoints: 0, batchId: "" },
          ],
    );
  }
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F10") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <>
      {bill.draftNotice && (
        <p className="notice">
          <T>{"A previous draft is saved on this device."}</T>{" "}
          <button
            className="text-button"
            disabled={bill.pending}
            onClick={bill.restoreDraft}
          >
            <T>{"Restore draft"}</T>
          </button>{" "}
          <button
            className="text-button"
            disabled={bill.pending}
            onClick={bill.reset}
          >
            <T>{"Discard saved draft"}</T>
          </button>
          <span>
            <T>{"Prices and stock will be refreshed."}</T>
          </span>
        </p>
      )}
      {!bill.draftNotice && (
        <HeldBills
          draft={bill.draft}
          onRestore={bill.restore}
          onHeld={bill.reset}
          busy={bill.pending}
          setBusy={bill.setPending}
        />
      )}
      <fieldset
        className="billing-fieldset"
        disabled={bill.pending || bill.draftNotice}
      >
        <form ref={formRef} onSubmit={bill.save}>
          <div className="billing-grid">
            <div className="billing-work-column">
              <MedicineSearch onAdd={addMedicine} />
              <OcrPanel onAdd={addMedicine} />
              <section className="panel billing-cart-panel">
                <h2><T>{"Items on this bill"}</T></h2>
                <CartTable cart={bill.cart} setCart={bill.setCart} />
              </section>
            </div>
            <section className="panel stack billing-checkout">
              <CustomerPicker
                initial={customers}
                value={bill.customerId}
                onChange={(id) => {
                  bill.setCustomerId(id);
                  bill.setLoyaltyPoints(0);
                }}
              />
              {bill.cart.some((l) => l.medicine.schedule !== "NONE") && (
                <>
                  <label>
                    <T>{"Doctor name"}</T>
                    <input
                      required
                      value={bill.doctorName}
                      onChange={(e) => bill.setDoctor(e.target.value)}
                    />
                  </label>
                  <label>
                    <T>{"Prescription reference"}</T>
                    <input
                      required
                      value={bill.prescriptionRef}
                      onChange={(e) => bill.setPrescription(e.target.value)}
                    />
                  </label>
                </>
              )}
              <label>
                <T>{"Bill discount (₹)"}</T>
                <input
                  inputMode="decimal"
                  value={bill.discount}
                  onChange={(e) => bill.setDiscount(e.target.value)}
                />
              </label>
              {loyalty.enabled && (
                <LoyaltyPicker
                  customerId={bill.customerId}
                  value={bill.loyaltyPoints}
                  onChange={bill.setLoyaltyPoints}
                  rate={loyalty.rate}
                />
              )}
              {bill.totals && <BillTotals totals={bill.totals} />}
              <PaymentFields
                value={bill.payment}
                onChange={bill.setPayment}
                totalPaise={bill.totals?.totalPaise ?? 0}
              />
              {(bill.error || bill.calculationError) && (
                <p role="alert" className="error">
                  {bill.error || bill.calculationError}
                </p>
              )}
              <button
                className="button billing-desktop-submit"
                disabled={
                  bill.pending || !bill.totals || !!bill.calculationError
                }
              >
                <T>{bill.pending ? "Saving…" : "Save bill · F10"}</T>
              </button>
              <small>
                <T>{"Prices and stock are checked again when you save."}</T>
              </small>
            </section>
          </div>
          <div className="billing-mobile-bar">
            <div>
              <span><T>{"Total"}</T></span>
              <strong>{formatMoney(bill.totals?.totalPaise ?? 0)}</strong>
            </div>
            <button
              type="submit"
              className="button"
              disabled={bill.pending || !bill.totals || !!bill.calculationError}
            >
              <T>{bill.pending ? "Saving…" : "Save bill"}</T>
            </button>
          </div>
        </form>
      </fieldset>
    </>
  );
}
