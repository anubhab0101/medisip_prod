import { it, expect } from "vitest";
import { reportRange } from "../src/features/reports/schema";
it("validates actual report calendar dates and inclusive India date ranges", () => {
  expect(() => reportRange({ from: "2026-02-30" })).toThrow("valid dates");
  expect(() => reportRange({ from: "2026-10-08", to: "2026-10-07" })).toThrow();
  const r = reportRange({ from: "2026-10-08", to: "2026-10-09" });
  expect(r.start.toISOString()).toBe("2026-10-07T18:30:00.000Z");
  expect(r.end.toISOString()).toBe("2026-10-09T18:30:00.000Z");
});
