"use client";
import { createContext, useContext } from "react";
import type { Locale } from "./locale";
import { translate } from "./translate";
const LocaleContext = createContext<Locale>("en");
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}
export function useLocale() {
  return useContext(LocaleContext);
}
export function useTranslation() {
  const locale = useLocale();
  return (text: string, values?: Record<string, string | number>) =>
    translate(locale, text, values);
}
/** Explicit UI copy only: never wrap customer names, medicine names, or saved message bodies. */
export function T({
  children,
  values,
}: {
  children: string;
  values?: Record<string, string | number>;
}) {
  const t = useTranslation();
  return t(children, values);
}
