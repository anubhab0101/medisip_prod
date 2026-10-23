import { test, expect } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {}
test("owner can add medicine, receive stock and save a real database bill", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    !process.env.DATABASE_URL || !process.env.SEED_OWNER_PASSWORD,
    "Requires configured isolated development database.",
  );
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const tag = `${testInfo.project.name}-${Date.now()}`;
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SEED_OWNER_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Address", exact: true })
    .fill("Isolated practice shop, test address");
  await page
    .getByRole("textbox", { name: "Phone", exact: true })
    .fill("9999999999");
  await page.getByLabel("Drug licence no.").fill("PRACTICE-ONLY");
  await page.getByRole("button", { name: "Save shop details" }).click();
  await expect(page.getByRole("status")).toHaveText("Shop details saved.");
  await page.getByRole("link", { name: "Medicines", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Add medicine" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`Browser ${tag}`);
  await page.getByRole("button", { name: "Add medicine", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Medicine added");
  await page.getByRole("link", { name: "Purchases", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Add purchase" }).click();
  await page.getByLabel("Supplier invoice no.").fill(tag);
  await page
    .getByRole("combobox", { name: "Medicine", exact: true })
    .selectOption({ label: `Browser ${tag}` });
  await page.getByRole("textbox", { name: /^Batch no\./ }).fill(tag);
  await page.getByLabel("Expiry month").fill("2099-12");
  await page.getByLabel("Quantity", { exact: true }).fill("5");
  await page.getByLabel("Purchase price per unit").fill("8.00");
  await page.getByLabel("MRP per unit").fill("10.00");
  await page.getByRole("button", { name: "+ Add another medicine" }).click();
  const second = page.getByRole("region", { name: "Purchase item 2" });
  await second
    .getByRole("combobox", { name: "Medicine", exact: true })
    .selectOption({ label: `Browser ${tag}` });
  await second.getByRole("textbox", { name: /^Batch no\./ }).fill(`${tag}-2`);
  await second.getByLabel("Expiry month").fill("2099-11");
  await second.getByLabel("Quantity", { exact: true }).fill("2");
  await second.getByLabel("Purchase price per unit").fill("8.00");
  await second.getByLabel("MRP per unit").fill("10.00");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByRole("status")).toContainText("Purchase saved");
  await page.getByRole("link", { name: "New bill", exact: true }).click();
  await page
    .getByPlaceholder("Name, ingredient or scan barcode")
    .fill(`Browser ${tag}`);
  await page
    .getByRole("button", { name: new RegExp(`Browser ${tag}`) })
    .click();
  await expect(page.locator(".grand")).toContainText("₹10.00");
  await page
    .locator("summary")
    .filter({ hasText: "Find / add customer by phone" })
    .click();
  await page
    .getByRole("textbox", { name: "Customer mobile", exact: true })
    .fill(`9${String(Date.now()).slice(-9)}`);
  await page
    .getByRole("textbox", { name: "Customer name (if new)", exact: true })
    .fill(`Held customer ${tag}`);
  await page
    .getByRole("button", { name: "Use this customer", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Customer", exact: true }),
  ).toContainText(`Held customer ${tag}`);
  await page
    .locator("summary")
    .filter({ hasText: "Hold / resume bills" })
    .click();
  await page
    .getByRole("textbox", { name: "Hold label", exact: true })
    .fill(tag);
  await page
    .getByRole("button", { name: "Hold this bill", exact: true })
    .click();
  await expect(
    page.getByText("Bill held. You can start another bill.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Resume ${tag}`, exact: true })
    .click();
  await expect(page.locator(".grand")).toContainText("₹10.00");
  await expect(
    page
      .getByRole("combobox", { name: "Customer", exact: true })
      .locator("option:checked"),
  ).toContainText(`Held customer ${tag}`);
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(page.locator(".grand")).toContainText("₹10.00");
  await page.screenshot({
    path: testInfo.outputPath("before-save.png"),
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Payment", exact: true })
    .selectOption("SPLIT");
  await page
    .getByRole("textbox", { name: "Cash amount (₹)", exact: true })
    .fill("4");
  await page.getByRole("textbox", { name: /Cash received/ }).fill("10");
  await expect(page.getByText("Change to give: ₹6.00")).toBeVisible();
  await page.getByRole("button", { name: "Save bill · F10" }).click();
  await expect(page.getByRole("heading", { name: "Bill saved" })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".invoice")).toContainText(`Browser ${tag}`);
  await page
    .locator("summary")
    .filter({ hasText: "Share receipt securely" })
    .click();
  await page
    .getByRole("button", { name: "Create receipt link", exact: true })
    .click();
  const receiptLink = page.getByRole("textbox", {
    name: "Customer receipt link",
    exact: true,
  });
  await expect(receiptLink).toHaveValue(
    /^http:\/\/127\.0\.0\.1:3002\/r\/[A-Za-z0-9_-]{43}$/,
  );
  const receiptUrl = await receiptLink.inputValue();
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(receiptUrl);
  await expect(
    guestPage.getByRole("cell").filter({ hasText: `Browser ${tag}` }),
  ).toBeVisible();
  await expect(guestPage.locator("a, form, script")).toHaveCount(0);
  expect(await guest.cookies()).toEqual([]);
  for (const path of ["/", "/login", "/dashboard", "/api/auth/session"])
    expect(
      (await guest.request.get(`http://127.0.0.1:3002${path}`)).status(),
    ).toBe(404);
  const staffResponse = await guest.request.get(
    "http://127.0.0.1:3000/billing",
    { maxRedirects: 0 },
  );
  expect([302, 303, 307]).toContain(staffResponse.status());
  await page.screenshot({
    path: testInfo.outputPath("invoice.png"),
    fullPage: true,
  });
  await page
    .locator("summary")
    .filter({ hasText: "Return items / void bill" })
    .click();
  await page.locator('input[name^="quantity:"]').fill("1");
  await page
    .getByRole("textbox", { name: "Reason", exact: true })
    .fill("Browser test return");
  await page
    .getByRole("checkbox", {
      name: "I checked the returned items and quantities.",
    })
    .check();
  await page
    .getByRole("button", { name: "Confirm return", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Recorded returns" }),
  ).toBeVisible();
  await expect(page.locator(".invoice")).toContainText("RETURNED");
  expect((await guest.request.get(receiptUrl)).status()).toBe(404);
  await guest.close();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Stock", exact: true }).click();
  await page.getByRole("link", { name: "Low stock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Low stock", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill(`Browser ${tag}`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: `Browser ${tag}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Medicines", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Medicines", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill(`Browser ${tag}`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: `Browser ${tag}`, exact: true }).click();
  await page.getByLabel("Rack", { exact: true }).fill("A2");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Medicine updated");
  await page.getByRole("link", { name: "Stock history", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Stock history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /Supplier invoice/ }),
  ).toHaveCount(2);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("dashboard.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
