import { z } from "zod";
export function manualMessage(
  channel: "WHATSAPP" | "EMAIL",
  to: string,
  body: string,
  subject = "Message from your pharmacy",
) {
  if (channel === "WHATSAPP") {
    const phone = z
      .string()
      .regex(/^\+?[1-9]\d{7,14}$/)
      .parse(to)
      .replace(/^\+/, "");
    return `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
  }
  const email = z.string().email().parse(to);
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function promotionalSendAt(now = new Date()) {
  const india = new Date(now.getTime() + 330 * 60000);
  const hour = india.getUTCHours();
  if (hour >= 8 && hour < 21) return now;
  if (hour >= 21) india.setUTCDate(india.getUTCDate() + 1);
  india.setUTCHours(8, 0, 0, 0);
  return new Date(india.getTime() - 330 * 60000);
}
export function renderTemplate(
  body: string,
  variables: Record<string, string>,
) {
  return body.replace(
    /\{([a-z]+)\}/g,
    (_, key: string) => variables[key] ?? `{${key}}`,
  );
}
