"use client";
import { T } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";
import { loyaltyBalance } from "./actions";
export function LoyaltyPicker({
  customerId,
  value,
  onChange,
  rate,
}: {
  customerId: string;
  value: number;
  onChange: (n: number) => void;
  rate: number;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBalance(null);
    setError("");
    if (customerId)
      loyaltyBalance(customerId)
        .then((n) => {
          if (active) setBalance(n);
        })
        .catch(() => {
          if (active)
            setError(
              "Could not load points. Retry by selecting the customer again.",
            );
        });
    return () => {
      active = false;
    };
  }, [customerId]);
  return customerId ? (
    <label>
      <T>{"Use loyalty points"}</T>{" "}
      {balance !== null && (
        <small>
          {balance}
          <T>{" points available · ₹"}</T>
          {(rate / 100).toFixed(2)}
          <T>{" per point"}</T>
        </small>
      )}
      <input
        type="number"
        min="0"
        max={Math.max(0, balance ?? 0)}
        value={value}
        disabled={balance === null}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {error && <small>{error}</small>}
    </label>
  ) : null;
}
