import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { isolatedPreview } from "./isolated-preview.mjs";
// This reserved hostname is never contacted. It proves runtime configuration is used.
const site = "https://pharmacy.example.invalid";
const test = await isolatedPreview(process.argv[2], { appUrl: site });
try {
  const request = await test.browser.newContext();
  const sitemap = await request.request.get(test.origin + "/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain(`<loc>${site}/</loc>`);
  expect(xml).not.toContain("127.0.0.1");
  expect(xml).not.toContain("/billing");
  const robots = await request.request.get(test.origin + "/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${site}/sitemap.xml`);
  expect(await robots.text()).toContain("Disallow: /notifications");
  const page = await request.newPage();
  await page.goto(test.origin);
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  expect(new URL(await canonical.getAttribute("href")).href).toBe(site + "/");
  const login = await request.request.get(test.origin + "/login");
  expect(login.headers()["x-robots-tag"]).toContain("noindex");
  const staff = await request.request.get(test.origin + "/stock", {
    maxRedirects: 0,
  });
  expect(staff.status()).toBe(307);
  await writeFile(
    ".local/runtime-seo-result.json",
    JSON.stringify(
      {
        passed: true,
        sitemapRuntimeOrigin: true,
        robotsRuntimeOrigin: true,
        canonicalRuntimeOrigin: true,
        privateNoindex: true,
        guestDenied: true,
        databaseWrites: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Runtime SEO passed: sitemap, robots and canonical follow the deployed origin; private pages remain protected.",
  );
} finally {
  await test.close();
}
