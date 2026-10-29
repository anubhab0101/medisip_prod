import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { receiptHandler } from "../src/features/receipts/http";
// Read only receipt settings from the shared file; never import staff credentials.
const localEnvPath = resolve(".env.local");
if (existsSync(localEnvPath)) {
  const localEnv = parseEnv(readFileSync(localEnvPath, "utf8"));
  for (const key of [
    "RECEIPT_DATABASE_URL",
    "RECEIPT_PUBLIC_URL",
    "RECEIPT_PORT",
    "RECEIPT_BIND",
  ]) {
    if (process.env[key] === undefined && localEnv[key] !== undefined) {
      process.env[key] = localEnv[key];
    }
  }
} else {
  // Keep compatibility with the dedicated receipt service deployment.
  try {
    process.loadEnvFile(".env.receipts.local");
  } catch {}
}
const rawDatabaseUrl = process.env.RECEIPT_DATABASE_URL;
const publicUrl = process.env.RECEIPT_PUBLIC_URL;
if (!rawDatabaseUrl || !publicUrl)
  throw new Error("Configure the isolated receipt service environment.");
function enforceTls(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("sslmode"))
      u.searchParams.set("sslmode", "verify-full");
    if (!u.searchParams.has("sslaccept"))
      u.searchParams.set("sslaccept", "strict");
    return u.toString();
  } catch {
    return url;
  }
}
const databaseUrl =
  process.env.NODE_ENV === "production"
    ? enforceTls(rawDatabaseUrl)
    : rawDatabaseUrl;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const handler = receiptHandler(
  async (tokenHash) => {
    const row = await prisma.receiptShare.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { snapshot: true, id: true },
    });
    if (!row) return null;
    return row.snapshot;
  },
  new URL(publicUrl).host,
  async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
);
const server = createServer(handler);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(
  Number(process.env.PORT ?? process.env.RECEIPT_PORT ?? 3002),
  process.env.RECEIPT_BIND ?? "127.0.0.1",
  () => console.log("Receipt-only service is ready."),
);
async function shutdown() {
  server.close();
  await prisma.$disconnect();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
