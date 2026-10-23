import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.loadEnvFile(".env.local");
const origin = "http://127.0.0.1:3000";
const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/login");
  for (const locale of ["hi", "or", "en"]) {
    await page.locator('select[name="locale"]').selectOption(locale);
    await page.locator('form:has(select[name="locale"]) button').click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('select[name="locale"]')).toHaveValue(locale);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await page.waitForLoadState("networkidle");
    const heading = await page.locator("h1").innerText();
    expect(heading).toMatch(
      locale === "hi"
        ? /[\u0900-\u097f]/
        : locale === "or"
          ? /[\u0b00-\u0b7f]/
          : /Welcome/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/language-login-${locale}.png`,
      fullPage: true,
    });
  }
  await page.locator('input[name="email"]').fill(process.env.SEED_OWNER_EMAIL);
  await page
    .locator('input[name="password"]')
    .fill(process.env.SEED_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  for (const locale of ["hi", "or", "en"]) {
    await page.locator('select[name="locale"]').selectOption(locale);
    await page.locator('form:has(select[name="locale"]) button').click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    const billing = await page
      .locator('nav a[href="/billing"]')
      .first()
      .innerText();
    await page.locator("main h1").waitFor();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('select[name="locale"]')).toHaveValue(locale);
    expect(billing).toMatch(
      locale === "hi"
        ? /[\u0900-\u097f]/
        : locale === "or"
          ? /[\u0b00-\u0b7f]/
          : /New bill/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/language-dashboard-${locale}.png`,
      fullPage: true,
    });
    results.push({
      locale,
      loginPersists: true,
      dashboardSwitch: true,
      mobileNoOverflow: true,
    });
  }
  expect(errors).toEqual([]);
  await writeFile(
    ".local/languages-result.json",
    JSON.stringify(
      { results, consoleErrors: 0, databaseSamplesWritten: false },
      null,
      2,
    ),
  );
  console.log(
    "English/Hindi/Odia login persistence and mobile dashboard language switching passed.",
  );
} finally {
  await browser.close();
}
