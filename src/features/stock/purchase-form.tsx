"use client";
import { T } from "@/lib/i18n/provider";

import { useState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { purchaseAction } from "./actions";

export function PurchaseForm({
  suppliers,
  medicines,
  date,
  operationId,
  orderId,
  initialItems,
}: {
  suppliers: { id: string; name: string }[];
  medicines: { id: string; name: string }[];
  date: string;
  operationId: string;
  orderId?: string;
  initialItems?: { medicineId: string; quantity: number }[];
}) {
  const [rows, setRows] = useState(initialItems?.map((_, i) => i) ?? [0]);
  const [next, setNext] = useState(initialItems?.length ?? 1);
  return (
    <ActionForm action={purchaseAction} label="Save purchase">
      <input type="hidden" name="operationId" value={operationId} />
      {orderId && <input type="hidden" name="orderId" value={orderId} />}
      <div className="fields">
        <label>
          <T>{"Supplier"}</T>
          <select name="supplierId">
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T>{"Supplier invoice no."}</T>
          <input name="invoiceNo" required maxLength={100} />
        </label>
        <label>
          <T>{"Date"}</T>
          <input type="date" name="date" defaultValue={date} required />
        </label>
      </div>
      {rows.map((row, index) => (
        <section
          className="panel"
          key={row}
          aria-label={`Purchase item ${index + 1}`}
        >
          <div className="fields">
            <label>
              <T>{"Medicine"}</T>
              <select
                name="medicineId"
                defaultValue={initialItems?.[row]?.medicineId}
              >
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <T>{"Batch no."}</T>
              <input name="batchNo" required maxLength={100} />
              <small>
                <T>{"Printed on the strip or box."}</T>
              </small>
            </label>
            <label>
              <T>{"Expiry month"}</T>
              <input name="expiryMonth" type="month" required />
            </label>
            <label>
              <T>{"Quantity"}</T>
              <input
                name="quantity"
                defaultValue={initialItems?.[row]?.quantity}
                type="number"
                min="1"
                max="1000000"
                required
              />
            </label>
            <label>
              <T>{"Purchase price per unit (₹)"}</T>
              <input name="cost" inputMode="decimal" required />
            </label>
            <label>
              <T>{"MRP per unit (₹)"}</T>
              <input name="mrp" inputMode="decimal" required />
            </label>
          </div>
          {rows.length > 1 && (
            <button
              className="button secondary"
              type="button"
              onClick={() => setRows(rows.filter((r) => r !== row))}
            >
              <T>{"Remove item "}</T>
              {index + 1}
            </button>
          )}
        </section>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={rows.length >= 100}
        onClick={() => {
          setRows([...rows, next]);
          setNext(next + 1);
        }}
      >
        <T>{"+ Add another medicine"}</T>
      </button>
    </ActionForm>
  );
}
