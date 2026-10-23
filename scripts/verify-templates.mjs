import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
process.loadEnvFile(".env.local");
process.loadEnvFile(".env.migration.local");
const database = process.argv[2];
if (!/^medishop_restore_\d+$/.test(database ?? ""))
  throw new Error("Supply a separate restore-rehearsal database name.");
const url = new URL(process.env.MIGRATION_DATABASE_URL);
url.pathname = `/${database}`;
const origin = "http://127.0.0.1:3005";
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3005",
  ],
  {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      AUTH_URL: origin,
      APP_URL: origin,
      SMS_SEND_ENABLED: "false",
      LOCAL_PREVIEW: "true",
    },
  },
);
const browser = await chromium.launch();
const key = `Browser template ${Date.now()}`;
let id;
let page;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Isolated preview exited.");
    try {
      if ((await fetch(origin + "/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  if (!ready) throw new Error("Isolated preview did not start.");
  page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SEED_OWNER_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.goto(origin + "/notifications/templates");
  const create = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "+ New template" }) });
  await create.locator("summary").click();
  await create.getByLabel("Name", { exact: true }).fill(key);
  await create.locator('select[name="channel"]').selectOption("EMAIL");
  await create
    .locator('textarea[name="body"]')
    .fill("Hello {name}, Dr {doctor} at {time}, {shop}.");
  await create
    .getByLabel("Preview name", { exact: true })
    .fill("Preview person");
  await create.getByLabel("Preview doctor", { exact: true }).fill("Doctor A");
  await create.getByLabel("Preview time", { exact: true }).fill("5 PM");
  await expect(create.locator(".notice")).toContainText(
    "Hello Preview person, Dr Doctor A at 5 PM",
  );
  await create.getByRole("button", { name: "Save template" }).click();
  await expect
    .poll(
      async () =>
        (await prisma.notificationTemplate.findFirst({ where: { key } }))?.id,
    )
    .toBeTruthy();
  id = (await prisma.notificationTemplate.findFirstOrThrow({ where: { key } }))
    .id;
  await page.goto(origin + "/notifications");
  await page.getByLabel(/^Template/).selectOption(id);
  await expect(page.locator('form:has(select[name="customerId"]) select[name="channel"]')).toHaveValue("EMAIL");
  await page.getByLabel("doctor", { exact: true }).fill("Doctor B");
  await page.getByLabel("time", { exact: true }).fill("6 PM");
  await expect(page.locator('textarea[name="body"]')).toHaveValue(
    /Dr Doctor B at 6 PM/,
  );
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/templates-mobile.png",
    fullPage: true,
  });
  await page.goto(origin + "/notifications/templates");
  const saved = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: key }) });
  await saved.locator("summary").click();
  await saved.getByLabel("Available for new messages").uncheck();
  await saved.getByRole("button", { name: "Save template" }).click();
  await expect
    .poll(
      async () =>
        (await prisma.notificationTemplate.findUnique({ where: { id } }))
          ?.active,
    )
    .toBe(false);
  await page.goto(origin + "/notifications");
  expect(
    await page
      .getByLabel(/^Template/)
      .locator(`option[value="${id}"]`)
      .count(),
  ).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    ".local/templates-browser-result.json",
    JSON.stringify(
      {
        passed: true,
        database,
        create: true,
        preview: true,
        reuse: true,
        archive: true,
        mobileOverflow: false,
        messagesSent: 0,
        mainDatabaseTouched: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Template browser flow passed: save, preview, reuse, archive, mobile layout. No messages sent; main shop untouched.",
  );
} catch (error) {
  if (page) {
    await page.screenshot({
      path: ".local/templates-failure.png",
      fullPage: true,
    });
    await writeFile(".local/templates-failure.html", await page.content());
  }
  throw error;
} finally {
  await browser.close();
  server.kill();
  const records = await prisma.notificationTemplate.findMany({
    where: { key },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      entity: "NotificationTemplate",
      entityId: { in: records.map((record) => record.id) },
    },
  });
  await prisma.notificationTemplate.deleteMany({ where: { key } });
  await prisma.$disconnect();
}

