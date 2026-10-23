"use client";
import { useFormStatus } from "react-dom";
import { changeLanguage } from "@/lib/i18n/actions";
import { T, useLocale, useTranslation } from "@/lib/i18n/provider";
function Choice() {
  const locale = useLocale();
  const t = useTranslation();
  const { pending } = useFormStatus();
  return (
    <>
      <select
        key={locale}
        aria-label={t("Language")}
        name="locale"
        defaultValue={locale}
        disabled={pending}
      >
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
        <option value="or">ଓଡ଼ିଆ</option>
      </select>
      <button className="button secondary" disabled={pending}>
        <T>{pending ? "Saving…" : "Apply"}</T>
      </button>
    </>
  );
}
export function LanguageSwitch() {
  return (
    <form action={changeLanguage} className="inline no-print">
      <Choice />
    </form>
  );
}
