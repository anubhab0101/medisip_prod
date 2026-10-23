import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { spawnSync } from "node:child_process";
loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
if (args[0] === "migrate") {
  try { process.loadEnvFile(".env.migration.local"); } catch {}
  if (process.env.MIGRATION_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
}
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL in .env.local first.");
  process.exit(1);
}
const cli = new URL("../node_modules/prisma/build/index.js", import.meta.url);
const result = spawnSync(
  process.execPath,
  [decodeURIComponent(cli.pathname).replace(/^\/(\w:)/, "$1"), ...args],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
