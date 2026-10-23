import { test, expect } from "@playwright/test";
try {
  process.loadEnvFile(".env.local");
} catch {}
test("doctor broadcast previews chosen recipients without sending in practice mode", async ({
  page,
}, testInfo) => {
  test.skip(!process.env.SEED_OWNER_PASSWORD || !process.env.DATABASE_URL);
  test.setTimeout(120000);
  const tag = `Broadcast ${testInfo.project.name} ${Date.now()}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SEED_OWNER_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  await page.getByRole("link", { name: "Customers", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Add customer" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(tag);
  await page
    .getByRole("textbox", { name: "Mobile number", exact: true })
    .fill(`9${String(Date.now()).slice(-9)}`);
  await page.getByRole("checkbox", { name: "WhatsApp", exact: true }).check();
  await page.getByRole("button", { name: "Add customer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Customer");
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await page.getByRole("link", { name: "+ Broadcast", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Send by", exact: true })
    .selectOption("WHATSAPP");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Visit date", { exact: true }).fill(tomorrow);
  await page
    .getByRole("combobox", { name: "Customers", exact: true })
    .selectOption("SELECTED");
  await page
    .getByRole("textbox", { name: "Find customer", exact: true })
    .fill(tag);
  await page.getByRole("checkbox", { name: new RegExp(tag) }).check();
  await page
    .getByRole("button", { name: "Review recipients", exact: true })
    .click();
  await expect(page).toHaveURL(/\/notifications\/broadcast\/[^/]+$/, {
    timeout: 30000,
  });
  await expect(
    page.getByText("1 eligible customers", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Preview only: sending is disabled in practice mode.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".message-body")).toContainText(
    "Book your appointment now",
  );
  await expect(page.getByRole("button", { name: /Confirm/ })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("broadcast-preview.png"),
    fullPage: true,
  });
});
