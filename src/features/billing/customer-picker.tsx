"use client";
import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";
import {
  quickCustomerAction,
  getBillingCustomer,
} from "@/features/customers/quick-add";
type Customer = { id: string; name: string; phone: string };
export function CustomerPicker({
  initial,
  value,
  onChange,
}: {
  initial: Customer[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [customers, setCustomers] = useState(initial);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!value || customers.some((c) => c.id === value)) return;
    let active = true;
    getBillingCustomer(value)
      .then((customer) => {
        if (active && customer) setCustomers((c) => [...c, customer]);
      })
      .catch(() => {
        if (active) setError("Could not load the selected customer.");
      });
    return () => {
      active = false;
    };
  }, [value, customers]);
  async function selectCustomer() {
    setPending(true);
    setError("");
    try {
      const result = await quickCustomerAction({ phone, name });
      if (result.error) {
        setError(result.error);
        return;
      }
      const customer = result.id ? await getBillingCustomer(result.id) : null;
      if (customer) {
        setCustomers((c) => [
          ...c.filter((item) => item.id !== customer.id),
          customer,
        ]);
        onChange(customer.id);
        setOpen(false);
        setPhone("");
        setName("");
      }
    } catch {
      setError("Could not find or add the customer. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <label>
        <T>{"Customer"}</T>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">
            <T>{"Walk-in customer"}</T>
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.phone}
            </option>
          ))}
        </select>
      </label>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <T>{"Find / add customer by phone"}</T>
        </summary>
        <div className="stack">
          <label>
            <T>{"Customer mobile"}</T>
            <LocalizedInput
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
            />
          </label>
          <label>
            <T>{"Customer name (if new)"}</T>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
            />
          </label>
          <small>
            <T>
              {
                "Existing customers are selected by phone. New customers start with messages off."
              }
            </T>
          </small>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={selectCustomer}
          >
            <T>{pending ? "Finding customer…" : "Use this customer"}</T>
          </button>
        </div>
      </details>
    </>
  );
}
