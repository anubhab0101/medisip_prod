import messages from "./messages.json";
import type { Locale } from "./locale";
const dictionary: Record<string, { hi: string; or: string }> = messages;
/** English copy is the stable key and explicit fallback for newly introduced copy. */
export function translate(
  locale: Locale,
  text: string,
  values: Record<string, string | number> = {},
) {
  const key = text.trim();
  const translated = locale === "en" ? key : (dictionary[key]?.[locale] ?? key);
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  return (leading + translated + trailing).replace(
    /\{(\w+)\}/g,
    (token, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : token,
  );
}
