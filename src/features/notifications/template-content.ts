import { z } from "zod";
export const templateVariables = [
  "name",
  "shop",
  "date",
  "time",
  "doctor",
  "amount",
] as const;
export function templateFields(body: string) {
  return [
    ...new Set([...body.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])),
  ];
}
export const templateBody = z
  .string()
  .trim()
  .min(1)
  .max(1200)
  .refine((body) => {
    const stripped = body.replace(/\{([^{}]+)\}/g, "");
    return (
      !/[{}]/.test(stripped) &&
      templateFields(body).every((key) =>
        templateVariables.includes(key as (typeof templateVariables)[number]),
      )
    );
  }, "Use only {name}, {shop}, {date}, {time}, {doctor} and {amount} variables.");
export function fillTemplate(body: string, values: Record<string, string>) {
  templateBody.parse(body);
  const missing = templateFields(body).filter((key) => !values[key]?.trim());
  if (missing.length) throw new Error(`Fill in: ${missing.join(", ")}.`);
  return body.replace(/\{([^{}]+)\}/g, (_, key: string) => values[key].trim());
}
