import { T } from "@/lib/i18n/provider";
import { randomUUID } from "node:crypto";
import { ActionForm } from "@/components/shared/action-form";
import { returnAction } from "./return-actions";
export function ReturnForm({
  saleId,
  items,
}: {
  saleId: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    returnedQuantity: number;
  }[];
}) {
  const remaining = items.filter(
    (item) => item.quantity > item.returnedQuantity,
  );
  if (!remaining.length) return null;
  return (
    <details className="panel disclosure no-print">
      <summary>
        <T>{"Return items / void bill"}</T>
      </summary>
      <ActionForm action={returnAction} label="Confirm return">
        <input type="hidden" name="saleId" value={saleId} />
        <input type="hidden" name="operationId" value={randomUUID()} />
        <p>
          <T>
            {
              "Returned stock goes back to the original batch. Any outstanding credit is reduced first."
            }
          </T>
        </p>
        <div className="fields">
          {remaining.map((item) => (
            <label key={item.id}>
              {item.name}
              <input type="hidden" name="saleItemId" value={item.id} />
              <input
                name={`quantity:${item.id}`}
                type="number"
                min="0"
                max={item.quantity - item.returnedQuantity}
                defaultValue="0"
              />
              <small>
                <T>{"Up to "}</T>
                {item.quantity - item.returnedQuantity}
                <T>{" remaining."}</T>
              </small>
            </label>
          ))}
        </div>
        <label>
          <T>{"Reason"}</T>
          <input name="reason" required minLength={3} maxLength={300} />
        </label>
        <label>
          <T>{"Refund method"}</T>
          <select name="refundMethod">
            <option value="CASH">
              <T>{"Cash"}</T>
            </option>
            <option value="UPI">UPI</option>
            <option value="CARD">
              <T>{"Card"}</T>
            </option>
          </select>
        </label>
        <label className="checkbox">
          <input name="void" type="checkbox" />
          <T>{"Void the whole bill (all remaining items must be returned)"}</T>
        </label>
        <label className="checkbox">
          <input type="checkbox" required />
          <T>{"I checked the returned items and quantities."}</T>
        </label>
      </ActionForm>
    </details>
  );
}
