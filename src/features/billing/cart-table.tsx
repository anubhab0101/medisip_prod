"use client";
import {
  LocalizedSelect,
  LocalizedInput,
  LocalizedButton,
} from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";

import { shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import type { CartLine } from "./types";
export function CartTable({
  cart,
  setCart,
}: {
  cart: CartLine[];
  setCart: (cart: CartLine[]) => void;
}) {
  function update(index: number, patch: Partial<CartLine>) {
    setCart(
      cart.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }
  if (!cart.length)
    return (
      <div className="empty">
        <T>{"Search for a medicine above to start your bill."}</T>
      </div>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>
              <T>{"Medicine"}</T>
            </th>
            <th>
              <T>{"Batch"}</T>
            </th>
            <th>
              <T>{"Qty"}</T>
            </th>
            <th>
              <T>{"Discount %"}</T>
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cart.map((line, index) => (
            <tr key={line.medicine.id}>
              <td>
                <strong>{line.medicine.name}</strong>
                {line.medicine.batches.some(
                  (b) =>
                    (!line.batchId || b.id === line.batchId) &&
                    new Date(b.expiryDate).getTime() <=
                      new Date(shopDate()).getTime() + 30 * 86400000,
                ) && (
                  <small className="error">
                    <T>{"Check expiry: a batch expires within 30 days."}</T>
                  </small>
                )}
                {line.medicine.schedule !== "NONE" && (
                  <small>
                    <T>{"Prescription required"}</T>
                  </small>
                )}
              </td>
              <td>
                <LocalizedSelect
                  aria-label={`Batch for ${line.medicine.name}`}
                  value={line.batchId}
                  onChange={(e) => update(index, { batchId: e.target.value })}
                >
                  <option value="">
                    <T>{"Earliest expiry"}</T>
                  </option>
                  {line.medicine.batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchNo} · {formatMoney(b.mrpPaise)} ·{" "}
                      {new Date(b.expiryDate).toISOString().slice(0, 7)}
                    </option>
                  ))}
                </LocalizedSelect>
              </td>
              <td>
                <LocalizedInput
                  className="short-input"
                  aria-label={`Quantity for ${line.medicine.name}`}
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) =>
                    update(index, { quantity: Number(e.target.value) })
                  }
                />
              </td>
              <td>
                <LocalizedInput
                  className="short-input"
                  aria-label={`Discount for ${line.medicine.name}`}
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={line.discountBasisPoints / 100}
                  onChange={(e) =>
                    update(index, {
                      discountBasisPoints: Number(e.target.value) * 100,
                    })
                  }
                />
              </td>
              <td>
                <LocalizedButton
                  className="text-button"
                  type="button"
                  onClick={() => setCart(cart.filter((_, i) => i !== index))}
                  aria-label={`Remove ${line.medicine.name}`}
                >
                  <T>{"Remove"}</T>
                </LocalizedButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
