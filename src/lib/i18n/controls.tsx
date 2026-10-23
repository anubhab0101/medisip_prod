"use client";
import type { ComponentPropsWithRef } from "react";
import { useTranslation } from "./provider";
// Explicit display attributes only. Values/names/IDs and user data stay unchanged.
function useDisplayProps<
  T extends { placeholder?: string; title?: string; "aria-label"?: string },
>(props: T): T {
  const t = useTranslation();
  return {
    ...props,
    ...(props.placeholder ? { placeholder: t(props.placeholder) } : {}),
    ...(props.title ? { title: t(props.title) } : {}),
    ...(props["aria-label"] ? { "aria-label": t(props["aria-label"]) } : {}),
  };
}
export function LocalizedInput(props: ComponentPropsWithRef<"input">) {
  return <input {...useDisplayProps(props)} />;
}
export function LocalizedSelect(props: ComponentPropsWithRef<"select">) {
  return <select {...useDisplayProps(props)} />;
}
export function LocalizedTextarea(props: ComponentPropsWithRef<"textarea">) {
  return <textarea {...useDisplayProps(props)} />;
}
export function LocalizedButton(props: ComponentPropsWithRef<"button">) {
  return <button {...useDisplayProps(props)} />;
}
export function LocalizedNav(props: ComponentPropsWithRef<"nav">) {
  return <nav {...useDisplayProps(props)} />;
}
