import { test, expect } from "@playwright/test";
test("practice calculation works without creating a sale", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your pharmacy, simplified." }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("workspace.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Try billing practice" }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await expect(page.locator(".grand")).toContainText("₹224.00");
  await page.getByLabel("Quantity", { exact: true }).fill("0");
  await expect(page.locator("#practice").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Reset example" }).click();
  await expect(page.locator(".grand")).toContainText("₹112.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
