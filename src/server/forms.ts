import "server-only";
import { ZodError } from "zod";
import { friendlyError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/shared/action-form";
export async function saveResult(
  work: () => Promise<unknown>,
  paths: string[],
  success = "Saved.",
): Promise<FormState> {
  try {
    const id = await work();
    for (const path of paths) revalidatePath(path);
    return { error: "", success, ...(typeof id === "string" ? { id } : {}) };
  } catch (error) {
    return {
      error:
        error instanceof ZodError
          ? (error.issues[0]?.message ?? "Check the form fields.")
          : friendlyError(error),
    };
  }
}
export const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
export const number = (form: FormData, key: string) => Number(text(form, key));
