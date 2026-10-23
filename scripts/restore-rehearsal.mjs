import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
process.loadEnvFile(".env.local");
try {
  process.loadEnvFile(".env.migration.local");
} catch {}
const source = new URL(process.env.DATABASE_URL);
if (!source.pathname.startsWith("/medishop_dev"))
  throw new Error("Rehearsal is limited to the development database.");
const backupPath = process.argv[2];
if (!backupPath)
  throw new Error("Supply the encrypted backup file to rehearse.");
await access(backupPath);
if (!process.env.MIGRATION_DATABASE_URL)
  throw new Error(
    "Restore rehearsal requires the separate migration database credential.",
  );
const administrative = new URL(process.env.MIGRATION_DATABASE_URL);
if (
  administrative.host !== source.host ||
  administrative.pathname !== source.pathname
)
  throw new Error(
    "Migration and application credentials must refer to the same source database.",
  );
const target = `medishop_restore_${Date.now()}`;
const client = new PrismaClient({ datasourceUrl: administrative.toString() });
try {
  await client.$executeRawUnsafe(`CREATE DATABASE \`${target}\``);
} finally {
  await client.$disconnect();
}
administrative.pathname = `/${target}`;
const env = {
  ...process.env,
  DATABASE_URL: administrative.toString(),
  RESTORE_DATABASE_URL: administrative.toString(),
};
const migration = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, encoding: "utf8" },
);
if (migration.status !== 0)
  throw new Error(
    "Restore rehearsal migration failed. Target retained for investigation.",
  );
const restore = spawnSync(
  process.execPath,
  ["scripts/backup.mjs", "restore", backupPath],
  { env: { ...env, DATABASE_URL: process.env.DATABASE_URL }, encoding: "utf8" },
);
if (restore.status !== 0) {
  console.error(
    "Restore process failed; credential-bearing output was suppressed.",
  );
  throw new Error("Restore rehearsal failed. Target retained.");
}
console.log(restore.stdout.trim());
console.log(`Isolated rehearsal database retained: ${target}`);
