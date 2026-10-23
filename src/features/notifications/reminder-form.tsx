import { T } from "@/lib/i18n/provider";
import { randomUUID } from "node:crypto";
import { ActionForm } from "@/components/shared/action-form";
import { reminderAction } from "./reminder-actions";
export function ReminderForm({
  customerId,
  medicines,
}: {
  customerId: string;
  medicines: { id: string; name: string }[];
}) {
  return (
    <details className="panel disclosure">
      <summary>
        <T>{"Schedule refill / credit reminder"}</T>
      </summary>
      <p>
        <T>
          {
            "SMS reminders need the customer’s consent. Times use India time; reminders outside 8 AM–9 PM move to the next morning."
          }
        </T>
      </p>
      <ActionForm action={reminderAction} label="Schedule reminder">
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="operationId" value={randomUUID()} />
        <div className="fields">
          <label>
            <T>{"Reminder"}</T>
            <select name="kind">
              <option value="REFILL">
                <T>{"Medicine refill"}</T>
              </option>
              <option value="CREDIT">
                <T>{"Outstanding credit"}</T>
              </option>
            </select>
          </label>
          <label>
            <T>{"Medicine (for refill)"}</T>
            <select name="medicineId">
              <option value="">
                <T>{"Choose purchased medicine"}</T>
              </option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <T>{"Remind at"}</T>
            <input type="datetime-local" name="when" required />
          </label>
        </div>
      </ActionForm>
    </details>
  );
}
