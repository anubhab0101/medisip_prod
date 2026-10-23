"use server";
import { cookies } from "next/headers";
import type { FormState } from "@/components/shared/action-form";
import { saveResult, text } from "@/server/forms";
import { preparePractice } from "./practice-service";
export async function practiceAction(_state: FormState, form: FormData) {
  return saveResult(
    async () => {
      const branchId = await preparePractice({
        operationId: text(form, "operationId"),
        confirmed: form.get("confirmed") === "on",
        reset: form.get("reset") === "yes",
      });
      (await cookies()).set("medishop.branch", branchId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return branchId;
    },
    ["/settings/practice", "/dashboard", "/billing", "/stock", "/medicines"],
    "Practice shop is ready. Sample stock is available in Billing.",
  );
}
