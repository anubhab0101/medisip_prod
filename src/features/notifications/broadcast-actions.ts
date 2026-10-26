"use server";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";
import {
  previewBroadcast,
  confirmBroadcast,
  openBroadcastMessage,
} from "./broadcast-service";
export async function previewBroadcastAction(raw: unknown) {
  return saveResult(
    () => previewBroadcast(raw),
    ["/notifications/broadcast"],
    "Preview ready.",
  );
}
export async function confirmBroadcastAction(
  _state: FormState,
  form: FormData,
) {
  return saveResult(
    () =>
      confirmBroadcast({
        id: text(form, "id"),
        confirmed: form.get("confirmed") === "on",
      }),
    ["/notifications/broadcast", "/notifications"],
    "Broadcast confirmed. Queued messages are tracked below; manual channels still need staff to send them.",
  );
}
export async function openBroadcastAction(logId: string) {
  return saveResult(() => openBroadcastMessage(logId), [], "Ready to open.");
}
