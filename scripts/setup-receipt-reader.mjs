import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { appendFileSync, writeFileSync, existsSync } from "node:fs";
nextEnv.loadEnvConfig(process.cwd());
if (existsSync(".env.receipts.local")) throw new Error("Receipt environment already exists; preserve and review it rather than overwriting.");
const url = new URL(process.env.DATABASE_URL);
const database = url.pathname.slice(1);
if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error("Invalid database name.");
const oldUser = decodeURIComponent(url.username);
const separator = oldUser.lastIndexOf(".");
const prefix = separator >= 0 ? oldUser.slice(0, separator + 1) : "";
if (!/^[a-zA-Z0-9_.]*$/.test(prefix)) throw new Error("Invalid account prefix.");
const username = `${prefix}receipt_${Date.now().toString(36)}`;
const password = randomBytes(24).toString("base64url");
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`CREATE USER '${username}'@'%' IDENTIFIED BY '${password}'`);
  await prisma.$executeRawUnsafe(`GRANT SELECT ON \`${database}\`.\`ReceiptShare\` TO '${username}'@'%'`);
  // TiDB gateway routes by cluster prefix; preserve it for the new SQL account.
  url.username = username;
  url.password = password;
  url.searchParams.set("connection_limit", "2");
  writeFileSync(".env.receipts.local", `RECEIPT_DATABASE_URL=${url.toString()}\nRECEIPT_PUBLIC_URL=http://127.0.0.1:3002\nRECEIPT_PORT=3002\nRECEIPT_BIND=127.0.0.1\n`, { flag: "wx" });
  appendFileSync(".env.local", `\nRECEIPT_PUBLIC_URL=http://127.0.0.1:3002\nRECEIPT_TOKEN_SECRET=${randomBytes(32).toString("base64url")}\n`);
  console.log("Created isolated receipt reader; credentials saved only in ignored local environment files.");
} catch (error) { console.error("Receipt reader setup failed.", error.code ?? "Review database permissions."); process.exitCode = 1; } finally { await prisma.$disconnect(); }
