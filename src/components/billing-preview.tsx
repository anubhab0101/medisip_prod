"use client";
import { T } from "@/lib/i18n/provider";

import { useState } from "react";
import { calculateLine, roundBill } from "@/lib/gst";
import { parseMoney, formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
export function BillingPreview() {
  const [price, setPrice] = useState("112.00");
  const [qty, setQty] = useState("1");
  const [gst, setGst] = useState("1200");
  let result: ReturnType<typeof calculateLine> | undefined;
  let error = "";
  try {
    if (!/^\d+$/.test(qty))
      throw new Error("Enter a whole quantity of at least 1.");
    result = calculateLine(parseMoney(price), Number(qty), Number(gst));
  } catch {
    error = "Enter a valid price and a whole quantity of at least 1.";
  }
  return (
    <section className="panel" id="practice" aria-labelledby="practice-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <T>{"TRY THE FOUNDATION"}</T>
          </span>
          <h2 id="practice-title">
            <T>{"A little billing practice"}</T>
          </h2>
        </div>
        <span className="badge">
          <T>{"Calculation only"}</T>
        </span>
      </div>
      <p>
        <T>
          {
            "Explore GST-inclusive totals. This does not create a bill or change stock."
          }
        </T>
      </p>
      <div className="form-grid">
        <label>
          <T>{"Price on pack (₹)"}</T>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-invalid={!!error}
          />
        </label>
        <label>
          <T>{"Quantity"}</T>
          <input
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-invalid={!!error}
          />
        </label>
        <label>
          <T>{"GST rate"}</T>
          <select value={gst} onChange={(e) => setGst(e.target.value)}>
            {[0, 500, 1200, 1800, 2800].map((rate) => (
              <option key={rate} value={rate}>
                {rate / 100}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        <T>
          {
            "Sample tax rates for calculation testing; confirm each medicine’s rate before live use."
          }
        </T>
      </p>
      <div aria-live="polite">
        {result ? (
          <div className="totals">
            <div>
              <span>
                <T>{"Taxable amount"}</T>
              </span>
              <strong>{formatMoney(result.taxablePaise)}</strong>
            </div>
            <div>
              <span>CGST + SGST</span>
              <strong>
                {formatMoney(result.cgstPaise)} +{" "}
                {formatMoney(result.sgstPaise)}
              </strong>
            </div>
            <div>
              <span>
                <T>{"Round-off"}</T>
              </span>
              <strong>
                {formatMoney(roundBill(result.totalPaise).roundOffPaise)}
              </strong>
            </div>
            <div className="grand">
              <span>
                <T>{"Total"}</T>
              </span>
              <strong>
                {formatMoney(roundBill(result.totalPaise).totalPaise)}
              </strong>
            </div>
          </div>
        ) : (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      <Button
        className="secondary"
        onClick={() => {
          setPrice("112.00");
          setQty("1");
          setGst("1200");
        }}
      >
        <T>{"Reset example"}</T>
      </Button>
    </section>
  );
}
