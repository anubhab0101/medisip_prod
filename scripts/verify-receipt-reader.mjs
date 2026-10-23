import { PrismaClient } from "@prisma/client";
process.loadEnvFile(".env.receipts.local");
const prisma = new PrismaClient({ datasourceUrl: process.env.RECEIPT_DATABASE_URL });
try {
  await prisma.receiptShare.findMany({ select: { id: true }, take: 1 });
  let denied = false;
  try { await prisma.user.findMany({ select: { id: true }, take: 1 }); } catch { denied = true; }
  if (!denied) throw new Error("Receipt account can access staff records; permissions must be restricted.");
  let writesDenied = false;
  try { await prisma.$executeRaw`UPDATE ReceiptShare SET revokedAt=revokedAt WHERE id='permission-check-no-record'`; } catch { writesDenied = true; }
  if (!writesDenied) throw new Error("Receipt account has write permissions.");
  console.log("Receipt snapshots readable; staff-table access and writes denied.");
} catch { console.error("Receipt permission verification failed."); process.exitCode = 1; } finally { await prisma.$disconnect(); }
