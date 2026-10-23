import { test, expect } from "@playwright/test";
try {
  process.loadEnvFile(".env.local");
} catch {}
test("reserved counter saves offline, survives reload and syncs once", async ({
  page,
  context,
}) => {
  test.skip(!process.env.SEED_OWNER_PASSWORD);
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SEED_OWNER_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  await page.goto("/offline");
  await page.locator('input[name="quantity"]').first().fill("3");
  await page
    .getByRole("button", { name: "Reserve stock & open counter" })
    .click();
  await expect(page).toHaveURL(/offline-shell\/index.html$/, {
    timeout: 30000,
  });
  await expect(page.getByRole("status")).toContainText("Connected");
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Connected");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Offline");
  await page.getByRole("button", { name: "Add to bill", exact: true }).click();
  await page
    .getByRole("button", { name: "Save provisional bill", exact: true })
    .click();
  await expect(page.locator("#bills")).toContainText("Waiting to sync");
  await page.reload();
  await expect(page.locator("#bills")).toContainText("Waiting to sync");
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Sync saved bills", exact: true })
    .click();
  await expect(page.locator("#bills")).toContainText("Synced", {
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Sync saved bills", exact: true })
    .click();
  await expect(page.locator("#bills p")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Close counter & release stock", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Counter closed", {
    timeout: 30000,
  });
  await expect(page.locator("#billing")).toBeHidden();
});
