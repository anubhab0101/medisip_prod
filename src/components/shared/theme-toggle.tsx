"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { T, useTranslation } from "@/lib/i18n/provider";

const STORAGE_KEY = "medishop-theme";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const t = useTranslation();

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const theme = saved === "light" || saved === "dark"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    applyTheme(theme);
    setDark(theme === "dark");
    const syncTheme = (event: Event) => {
      const next = (event as CustomEvent<"light" | "dark">).detail;
      if (next === "light" || next === "dark") setDark(next === "dark");
    };
    window.addEventListener("medishop:theme-change", syncTheme);
    return () => window.removeEventListener("medishop:theme-change", syncTheme);
  }, []);

  function chooseTheme(next: "light" | "dark") {
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the selected theme for this page even if storage is unavailable.
    }
    setDark(next === "dark");
    window.dispatchEvent(new CustomEvent("medishop:theme-change", { detail: next }));
  }

  return (
    <div className="theme-toggle" role="group" aria-label={t("Theme")}>
      <button
        type="button"
        className={!dark ? "theme-option selected" : "theme-option"}
        onClick={() => chooseTheme("light")}
        aria-label={t("Light")}
        aria-pressed={!dark}
      >
        <Sun size={16} aria-hidden="true" /><span><T>{"Light"}</T></span>
      </button>
      <button
        type="button"
        className={dark ? "theme-option selected" : "theme-option"}
        onClick={() => chooseTheme("dark")}
        aria-label={t("Dark")}
        aria-pressed={dark}
      >
        <Moon size={16} aria-hidden="true" /><span><T>{"Dark"}</T></span>
      </button>
    </div>
  );
}
