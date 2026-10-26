import "server-only";
import { PrismaClient } from "@prisma/client";
const globalDb = globalThis as unknown as { medishopDb?: PrismaClient };
function enforceTls(url: string): string {
  try {
    const u = new URL(url);
    // For TiDB/MySQL, sslmode is typically a query parameter
    // Check if sslmode is already set
    if (!u.searchParams.has("sslmode")) {
      u.searchParams.set("sslmode", "verify-full");
    }
    // Also set sslaccept=strict for additional safety
    if (!u.searchParams.has("sslaccept")) {
      u.searchParams.set("sslaccept", "strict");
    }
    return u.toString();
  } catch {
    return url;
  }
}
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  const databaseUrl = process.env.NODE_ENV === "production"
    ? enforceTls(process.env.DATABASE_URL)
    : process.env.DATABASE_URL;
  if (!globalDb.medishopDb)
    globalDb.medishopDb = new PrismaClient({
      datasourceUrl: databaseUrl,
      transactionOptions: { maxWait: 15000, timeout: 20000 },
    });
  return globalDb.medishopDb;
}
