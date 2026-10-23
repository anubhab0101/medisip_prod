import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { receiptHandler } from "../src/features/receipts/http";
// Never load the staff app's environment or credentials into this process.
try {
  process.loadEnvFile(".env.receipts.local");
} catch {}
const databaseUrl = process.env.RECEIPT_DATABASE_URL;
const publicUrl = process.env.RECEIPT_PUBLIC_URL;
if (!databaseUrl || !publicUrl)
  throw new Error("Configure the isolated receipt service environment.");
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const handler = receiptHandler(async (tokenHash) => {
  const row = await prisma.receiptShare.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { snapshot: true },
  });
  return row?.snapshot ?? null;
}, new URL(publicUrl).host);
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
