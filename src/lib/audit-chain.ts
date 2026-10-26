import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { Prisma } from "@prisma/client";
type InputJsonValue = Prisma.InputJsonValue;

function toInputJson(value: unknown): InputJsonValue {
  if (value === null || value === undefined) return {} as InputJsonValue;
  return value as InputJsonValue;
}

export interface AuditChainEntry {
  id: string;
  branchId: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
  prevHash: string;
  hash: string;
}

const lastHashCache: Map<string, string> = new Map();

function computeHash(entry: Omit<AuditChainEntry, "hash" | "prevHash">, prevHash: string): string {
  const data = JSON.stringify({
    id: entry.id,
    branchId: entry.branchId,
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before,
    after: entry.after,
    createdAt: entry.createdAt.toISOString(),
    prevHash,
  });
  return createHash("sha256").update(data).digest("hex");
}

async function getLastHash(tx: Prisma.TransactionClient | typeof db, branchId: string): Promise<string> {
  if (lastHashCache.has(branchId)) {
    return lastHashCache.get(branchId)!;
  }
  const client = typeof tx === "function" ? tx() : tx;
  const lastEntry = await client.auditLog.findFirst({
    where: { branchId },
    orderBy: { createdAt: "desc" },
    select: { id: true, hash: true },
  });
  const hash = lastEntry?.hash ?? "0".repeat(64);
  lastHashCache.set(branchId, hash);
  return hash;
}

export async function createChainedAuditEntry(
  tx: Prisma.TransactionClient | typeof db,
  branchId: string,
  entry: Omit<AuditChainEntry, "prevHash" | "hash" | "id" | "createdAt">,
): Promise<{ id: string; hash: string; prevHash: string }> {
  const prevHash = await getLastHash(tx, branchId);
  const id = createHash("sha256")
    .update(`${branchId}:${entry.userId}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 24);
  const createdAt = new Date();
  const hash = computeHash({ ...entry, id, createdAt }, prevHash);

  const client = typeof tx === "function" ? tx() : tx;
  await client.auditLog.create({
    data: {
      id,
      branchId,
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toInputJson(entry.before),
      after: toInputJson(entry.after),
      createdAt,
      hash,
      prevHash,
    },
  });

  lastHashCache.set(branchId, hash);
  return { id, hash, prevHash };
}

export async function verifyAuditChain(branchId: string): Promise<{ valid: boolean; brokenAt?: string }> {
  const entries = await db().auditLog.findMany({
    where: { branchId },
    orderBy: { createdAt: "asc" },
    select: { id: true, branchId: true, userId: true, action: true, entity: true, entityId: true, before: true, after: true, createdAt: true, hash: true, prevHash: true },
  });

  let expectedPrevHash = "0".repeat(64);
  for (const entry of entries) {
    if (entry.prevHash !== expectedPrevHash) {
      return { valid: false, brokenAt: entry.id };
    }
    const computed = computeHash(
      { id: entry.id, branchId: entry.branchId, userId: entry.userId, action: entry.action, entity: entry.entity, entityId: entry.entityId, before: entry.before, after: entry.after, createdAt: entry.createdAt },
      entry.prevHash,
    );
    if (computed !== entry.hash) {
      return { valid: false, brokenAt: entry.id };
    }
    expectedPrevHash = entry.hash;
  }
  return { valid: true };
}

export function invalidateCache(branchId: string) {
  lastHashCache.delete(branchId);
}