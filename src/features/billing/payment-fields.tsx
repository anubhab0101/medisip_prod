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
      <label>
        <T>{"Payment"}</T>
        <select
          value={value.method}
          onChange={(e) => patch({ method: e.target.value, cashReceived: "" })}
        >
          <option value="CASH">
            <T>{"Cash"}</T>
          </option>
          <option value="UPI">UPI</option>
          <option value="CARD">
            <T>{"Card"}</T>
          </option>
          <option value="CREDIT">
            <T>{"Credit / udhar"}</T>
          </option>
          <option value="SPLIT">
            <T>{"Cash + another method"}</T>
          </option>
        </select>
      </label>
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
