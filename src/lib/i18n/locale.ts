export const locales = ["en", "hi", "or"] as const;
export type Locale = (typeof locales)[number];
export const localeCookie = "medishop.locale";
export function parseLocale(value: unknown): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : "en";
}
export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}
