import { test, expect } from "@playwright/test";
try {
  process.loadEnvFile(".env.local");
} catch {}
test("imports a CSV and reads printed text locally with mandatory review", async ({
  page,
}, testInfo) => {
  test.skip(!process.env.SEED_OWNER_PASSWORD);
  test.setTimeout(180000);
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://127.0.0.1:3000")
    )
      external.push(request.url());
  });
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SEED_OWNER_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  const name = `Import ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/medicines/import");
  const csv = `name,genericName,strength,dosageForm,manufacturer,hsn,gstPercent,packSize,barcode,schedule,reorderLevel,rack\n${name},Fictional ingredient,100 mg,tablet,Test,,0,10 tablets,,NONE,10,A1\n`;
  await page
    .getByLabel("Import file", { exact: true })
    .setInputFiles({
      name: "medicines.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(
    page.getByText("1 ready · 0 rows need fixing", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Import 1 medicines", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Medicines imported");
  await page.goto("/billing");
  await page
    .locator("summary")
    .filter({ hasText: "Read a printed prescription" })
    .click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 500;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "white";
    c.fillRect(0, 0, 1200, 500);
    c.fillStyle = "black";
    c.font = "48px Arial";
    c.fillText("PRINTED PRESCRIPTION", 50, 90);
    c.fillText("Practice medicine 01", 50, 190);
    c.fillText("Quantity 2", 50, 290);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Prescription image", { exact: true })
    .setInputFiles({
      name: "printed.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(
    page.getByRole("textbox", { name: "Review extracted text", exact: true }),
  ).toHaveValue(/Practice medicine/i, { timeout: 90000 });
  await page
    .getByRole("textbox", { name: "Medicine to find", exact: true })
    .fill("Practice medicine 01");
  await page
    .getByRole("button", { name: "Find medicine", exact: true })
    .click();
  const add = page.getByRole("button", { name: /Practice medicine 01.*add 1/ });
  await expect(add).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I checked the original prescription/ })
    .check();
  await add.click();
  await expect(page.locator(".grand")).toBeVisible();
  expect(external).toEqual([]);
});
