import "server-only";
import { PrismaClient } from "@prisma/client";
const globalDb = globalThis as unknown as { medishopDb?: PrismaClient };
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  if (!globalDb.medishopDb)
    globalDb.medishopDb = new PrismaClient({
      transactionOptions: { maxWait: 15000, timeout: 20000 },
    });
  return globalDb.medishopDb;
}
