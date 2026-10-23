"use server";
import { saveResult, text, number } from "@/server/forms";
import { parseMoney } from "@/lib/money";
import type { FormState } from "@/components/shared/action-form";
import { editDoctor } from "./edit-service";
const minute = (v: FormDataEntryValue | undefined) => {
  const [h, m] = String(v).split(":").map(Number);
  return h * 60 + m;
};
export async function editDoctorAction(_state: FormState, form: FormData) {
  return saveResult(
    () =>
      editDoctor({
        id: text(form, "id"),
        name: text(form, "name"),
        specialization: text(form, "specialization"),
        feePaise: parseMoney(text(form, "fee")),
        slotMinutes: number(form, "slotMinutes"),
        active: form.get("active") === "on",
        userId: text(form, "userId"),
        windows: form
          .getAll("weekday")
          .map((weekday, i) => ({
            weekday: Number(weekday),
            startMinute: minute(form.getAll("start")[i]),
            endMinute: minute(form.getAll("end")[i]),
          })),
      }),
    ["/appointments", "/appointments/doctors"],
    "Doctor details and weekly hours saved.",
  );
}
