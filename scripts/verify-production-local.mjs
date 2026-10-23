import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
process.loadEnvFile(".env.local");
const origin = "http://127.0.0.1:3000";
const browser = await chromium.launch();
try {
  const guest = await browser.newContext(),
    request = guest.request;
  const home = await request.get(origin);
  if (
    home.status() !== 200 ||
    (await home.text()).includes("Practice medicine")
  )
    throw new Error("Public homepage check failed.");
  const robots = await request.get(origin + "/robots.txt"),
    sitemap = await request.get(origin + "/sitemap.xml");
  if (
    robots.status() !== 200 ||
    !(await robots.text()).includes("Disallow: /billing")
  )
    throw new Error("Robots rules are missing.");
  const xml = await sitemap.text();
  if (
    sitemap.status() !== 200 ||
    !xml.includes(`<loc>${origin}/</loc>`) ||
    xml.includes("/billing")
  )
    throw new Error("Public sitemap check failed.");
  const protectedPage = await request.get(origin + "/billing", {
    maxRedirects: 0,
  });
  if (protectedPage.status() !== 307)
    throw new Error("Staff page is not protected.");
  const protectedApi = await request.get(origin + "/api/reports/export");
  if (protectedApi.status() !== 401)
    throw new Error("Staff export is not protected.");
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SEED_OWNER_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  for (const path of [
    "/dashboard",
    "/medicines",
    "/stock",
    "/billing",
    "/purchases",
    "/customers",
    "/appointments",
    "/reports",
    "/settings",
    "/settings/practice",
    "/appointments/booking-link",
    "/help",
  ]) {
    const response = await page.goto(origin + path);
    if (response.status() !== 200) throw new Error(`Page failed: ${path}`);
    if (!response.headers()["x-robots-tag"]?.includes("noindex"))
      throw new Error(`Private page indexing allowed: ${path}`);
    await page.locator("main h1").waitFor();
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.length}`);
  await page.goto(origin + "/medicines");
  await page.screenshot({ path: ".local/clean-medicines.png", fullPage: true });
  const prisma = new PrismaClient();
  let counts;
  try {
    counts = {
      medicines: await prisma.medicine.count(),
      batches: await prisma.batch.count(),
      sales: await prisma.sale.count(),
      customers: await prisma.customer.count(),
      doctors: await prisma.doctor.count(),
      practiceShops: await prisma.branch.count({ where: { demo: true } }),
    };
  } finally {
    await prisma.$disconnect();
  }
  const result = {
    checkedAt: new Date().toISOString(),
    productionPages: 12,
    publicSeo: true,
    privateRoutesProtected: true,
    consoleErrors: 0,
    currentShopCounts: counts,
  };
  await writeFile(
    ".local/production-smoke.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
