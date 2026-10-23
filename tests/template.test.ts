import { expect, it } from "vitest";
import {
  fillTemplate,
  templateBody,
  templateFields,
} from "../src/features/notifications/template-content";
it("allows only supported complete variables", () => {
  for (const body of ["{unknown}", "{name", "{{name}}", "{toString}", "{NAME}"])
    expect(templateBody.safeParse(body).success).toBe(false);
  expect(templateBody.safeParse("Hello {name} from {shop}").success).toBe(true);
});
it("requires every used value without recursively interpreting user text", () => {
  expect(() => fillTemplate("Hello {name}", {})).toThrow("name");
  expect(
    fillTemplate("Hello {name} at {time}", { name: "A {shop}", time: "10 AM" }),
  ).toBe("Hello A {shop} at 10 AM");
  expect(templateFields("{name} {name} {shop}")).toEqual(["name", "shop"]);
});
