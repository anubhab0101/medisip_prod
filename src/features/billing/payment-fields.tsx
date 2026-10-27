"use client";
import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";

import { formatMoney } from "@/lib/money";
import { preparePayment, type PaymentInput } from "./payment";
export function PaymentFields({
  value,
  onChange,
  totalPaise,
}: {
  value: PaymentInput;
  onChange: (value: PaymentInput) => void;
  totalPaise: number;
}) {
  const patch = (data: Partial<PaymentInput>) =>
    onChange({ ...value, ...data });
  let change = 0,
    remaining = 0;
  try {
    const result = preparePayment(value, totalPaise);
    change = result.changePaise;
    remaining = result.remainderPaise;
  } catch {}
  return (
    <>
      <fieldset className="payment-method-fieldset">
        <legend><T>{"Payment"}</T></legend>
        <div className="payment-methods" aria-label="Payment method">
          {([
            ["CASH", "Cash"],
            ["UPI", "UPI"],
            ["CARD", "Card"],
            ["CREDIT", "Credit"],
            ["SPLIT", "Split"],
          ] as const).map(([method, label]) => (
            <button
              type="button"
              key={method}
              className={value.method === method ? "payment-method selected" : "payment-method"}
              onClick={() => patch({ method, cashReceived: "" })}
              aria-pressed={value.method === method}
            >
              <T>{label}</T>
            </button>
          ))}
        </div>
      </fieldset>
      {value.method === "SPLIT" && (
        <>
          <label>
            <T>{"Cash amount (₹)"}</T>
            <input
              inputMode="decimal"
              value={value.firstAmount}
              onChange={(e) => patch({ firstAmount: e.target.value })}
              required
            />
          </label>
          <label>
            <T>{"Pay remaining by"}</T>
            <select
              value={value.secondMethod}
              onChange={(e) => patch({ secondMethod: e.target.value })}
            >
              <option value="UPI">UPI</option>
              <option value="CARD">
                <T>{"Card"}</T>
              </option>
              <option value="CREDIT">
                <T>{"Credit / udhar"}</T>
              </option>
            </select>
            <small>
              <T>{"Remaining: "}</T>
              {formatMoney(remaining)}
            </small>
          </label>
        </>
      )}
      {["CASH", "SPLIT"].includes(value.method) && (
        <label>
          <T>{"Cash received (₹)"}</T>
          <LocalizedInput
            inputMode="decimal"
            placeholder="Exact amount"
            value={value.cashReceived}
            onChange={(e) => patch({ cashReceived: e.target.value })}
          />
          <small>
            <T>{"Change to give: "}</T>
            {formatMoney(change)}
          </small>
        </label>
      )}
    </>
  );
}
