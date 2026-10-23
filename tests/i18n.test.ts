import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { translate } from "@/lib/i18n/translate";
import { isLocale, parseLocale } from "@/lib/i18n/locale";
import messages from "@/lib/i18n/messages.json";

describe("UI language selection", () => {
  it("allows only the three supported locale values", () => {
    for (const value of ["en", "hi", "or"]) expect(isLocale(value)).toBe(true);
    for (const value of ["hi-IN", "<script>", undefined, null, ""]) {
      expect(isLocale(value)).toBe(false);
      expect(parseLocale(value)).toBe("en");
    }
  });
  it("translates labels without changing English or unknown user copy", () => {
    expect(translate("en", "Medicines")).toBe("Medicines");
    expect(translate("hi", "Medicines")).toBe("दवाइयाँ");
    expect(translate("or", "Medicines")).toBe("ଔଷଧ");
    expect(translate("hi", "Customer name typed by staff")).toBe("Customer name typed by staff");
  });
  it("preserves text spacing and interpolates only supplied variables", () => {
    expect(translate("hi", " of ")).toBe(" में से ");
    expect(translate("or", "{name}: {value}", { name: "ନାମ" })).toBe("ନାମ: {value}");
    expect(translate("en", "{name}", { name: "$&" })).toBe("$&");
  });
  it("provides both translations for every curated key without leaked HTML entities", () => {
    for (const [key, value] of Object.entries(messages)) {
      expect(value.hi.trim(), key).not.toBe("");
      expect(value.or.trim(), key).not.toBe("");
      expect(key + value.hi + value.or).not.toMatch(/&(?:apos|amp|quot|lt|gt|#\d+);/);
    }
    const practice = readFileSync("src/app/(workspace)/settings/practice/page.tsx", "utf8");
    expect(practice).not.toContain("&apos;");
    const key = Object.keys(messages).find((copy) => copy.startsWith("Your real shop's medicines"));
    expect(key).toBeDefined();
    expect(translate("hi", key!)).not.toBe(key);
  });
});
