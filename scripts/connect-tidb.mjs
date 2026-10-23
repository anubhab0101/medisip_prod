import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
try {
  const databases = await prisma.$queryRawUnsafe("SHOW DATABASES");
  const target = "medishop_dev_20261008";
  const exists = databases.some((row) => Object.values(row).includes(target));
  if (!exists)
    await prisma.$executeRawUnsafe(
      "CREATE DATABASE `medishop_dev_20261008` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    );
  const tables = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema='medishop_dev_20261008'",
  );
  const mode = await prisma.$queryRawUnsafe("SELECT @@tidb_txn_mode AS mode");
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/" + target;
  const text = readFileSync(".env.local", "utf8").replace(
    /^DATABASE_URL=.*$/m,
    `DATABASE_URL="${url.toString()}"`,
  );
  writeFileSync(".env.local", text);
  console.log(
    JSON.stringify({
      connected: true,
      database: target,
      created: !exists,
      existingTables: Number(tables[0].total),
      transactionMode: mode[0].mode,
    }),
  );
} catch {
  console.error(
    "Database connection/setup failed. Credentials are not printed.",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
