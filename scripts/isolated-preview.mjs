import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
export async function isolatedPreview(database, { appUrl } = {}) {
  if (!/^medishop_restore_\d+$/.test(database ?? ""))
    throw new Error("A separate restore-rehearsal database is required.");
  process.loadEnvFile(".env.local");
  process.loadEnvFile(".env.migration.local");
  const url = new URL(process.env.MIGRATION_DATABASE_URL);
  url.pathname = `/${database}`;
  const origin = "http://127.0.0.1:3005";
  let occupied = false;
  try {
    await fetch(origin + "/login", { signal: AbortSignal.timeout(1000) });
    occupied = true;
  } catch {}
  if (occupied) throw new Error("Isolated test port is already in use.");
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
        APP_URL: appUrl ?? origin,
        SMS_SEND_ENABLED: "false",
        DAILY_BACKUP_ENABLED: "false",
        LOCAL_PREVIEW: "true",
      },
    },
  );
  const prisma = new PrismaClient({ datasourceUrl: url.toString() });
  let browser;
  const close = async () => {
    await browser?.close();
    server.kill();
    await prisma.$disconnect();
  };
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (server.exitCode !== null) throw new Error("Isolated preview exited.");
      try {
        if (
          (
            await fetch(origin + "/login", {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        ) {
          ready = true;
          break;
        }
      } catch {}
      await delay(500);
    }
    if (!ready) throw new Error("Isolated preview did not start.");
    browser = await chromium.launch();
    return { prisma, browser, origin, close };
  } catch (error) {
    await close();
    throw error;
  }
}
