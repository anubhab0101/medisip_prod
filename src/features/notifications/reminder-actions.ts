"use server";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
import { scheduleReminder, cancelReminder } from "./reminder-service";
export async function reminderAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      scheduleReminder({
        operationId: text(form, "operationId"),
        customerId: text(form, "customerId"),
        medicineId: text(form, "medicineId"),
        kind: text(form, "kind"),
        when: new Date(`${text(form, "when")}:00+05:30`).toISOString(),
      }),
    ["/customers"],
    "Reminder scheduled. Consent and outstanding balance are checked again before sending.",
  );
}

export async function cancelReminderAction(_state: FormState, form: FormData) {
  return saveResult(
    () => cancelReminder(text(form, "jobId")),
    ["/customers", "/notifications/reminders"],
    "Reminder cancelled.",
  );
}
