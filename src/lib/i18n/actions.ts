"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, localeCookie } from "./locale";
export async function changeLanguage(form: FormData) {
  const locale = form.get("locale");
  if (!isLocale(locale)) throw new Error("Unsupported language");
  (await cookies()).set(localeCookie, locale, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.LOCAL_PREVIEW !== "true",
  });
  revalidatePath("/", "layout");
}
