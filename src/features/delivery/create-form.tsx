import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { ActionForm } from "@/components/shared/action-form";
import { createDeliveryAction } from "./actions";
export function DeliveryForm({ saleId }: { saleId: string }) {
  return (
    <details className="panel disclosure no-print">
      <summary>
        <T>{"Arrange home delivery"}</T>
      </summary>
      <ActionForm action={createDeliveryAction} label="Add delivery">
        <input type="hidden" name="saleId" value={saleId} />
        <div className="fields">
          <label>
            <T>{"Delivery mobile"}</T>
            <input type="tel" name="phone" required />
          </label>
          <label>
            <T>{"Assigned to"}</T>
            <input name="assignedTo" maxLength={150} />
          </label>
        </div>
        <label>
          <T>{"Delivery address"}</T>
          <textarea name="address" required minLength={5} maxLength={1000} />
        </label>
        <label>
          <T>{"Delivery notes"}</T>
          <textarea name="notes" maxLength={1000} />
        </label>
      </ActionForm>
      <Link className="text-link" href="/deliveries">
        <T>{"Track deliveries"}</T>
      </Link>
    </details>
  );
}
