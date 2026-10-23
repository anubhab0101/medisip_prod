import "server-only";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { JobStatus } from "@prisma/client";
import { db } from "@/server/db";
import { shopDate } from "@/lib/date";
import { finishJob } from "./queue";

async function claim(key: string, type: string, now: Date) {
  const job = await db().job.upsert({
    where: { key },
    create: { key, type, payload: {}, runAt: now },
    update: {},
  });
  const leaseToken = randomUUID();
  const changed = await db().job.updateMany({
    where: {
      id: job.id,
      runAt: { lte: now },
      OR: [
        { status: "PENDING" },
        { status: "RUNNING", leaseUntil: { lt: now } },
      ],
    },
    data: {
      status: "RUNNING",
      leaseToken,
      leaseUntil: new Date(now.getTime() + 600000),
      attempts: { increment: 1 },
    },
  });
  return changed.count
    ? db().job.findFirst({ where: { id: job.id, leaseToken } })
    : null;
}

export async function scanBranch(branchId: string, date: string) {
  const cutoff = new Date(`${date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + 30);
  const [counts] = await db().$queryRaw<
    { expired: bigint; expiring: bigint }[]
  >`SELECT COALESCE(SUM(expiryDate < ${date}),0) AS expired, COALESCE(SUM(expiryDate >= ${date} AND expiryDate <= ${cutoff}),0) AS expiring FROM Batch WHERE branchId=${branchId} AND qtyOnHand>0`;
  const low = await db().$queryRaw<
    { count: bigint }[]
  >`SELECT COUNT(*) AS count FROM (SELECT bm.medicineId FROM BranchMedicine bm JOIN Medicine m ON m.id=bm.medicineId LEFT JOIN Batch b ON b.medicineId=bm.medicineId AND b.branchId=bm.branchId AND b.expiryDate>=${date} WHERE bm.branchId=${branchId} AND bm.active=1 AND m.active=1 GROUP BY bm.medicineId,bm.reorderLevel HAVING COALESCE(SUM(b.qtyOnHand-b.qtyReserved),0)<=bm.reorderLevel) levels`;
  return {
    date,
    expired: Number(counts.expired),
    expiring: Number(counts.expiring),
    lowStock: Number(low[0].count),
  };
}

export async function runMaintenance(now = new Date()) {
  const date = shopDate(now);
  const due = (hour: number) =>
    now >= new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+05:30`);
  let scans = 0,
    backup = false;
  if (due(7)) {
    const branches = await db().branch.findMany({
      where: { active: true, demo: false },
      select: { id: true },
    });
    for (const branch of branches) {
      const job = await claim(
        `daily-stock:${date}:${branch.id}`,
        "DAILY_STOCK_SCAN",
        now,
      );
      if (!job) continue;
      try {
        const summary = await scanBranch(branch.id, date);
        await db().auditLog.upsert({
          where: { id: job.id },
          create: {
            id: job.id,
            branchId: branch.id,
            userId: "system",
            action: "DAILY_STOCK_SCAN",
            entity: "Branch",
            entityId: branch.id,
            after: summary,
          },
          update: {},
        });
        await finishJob(job, JobStatus.DONE);
        scans++;
      } catch {
        await finishJob(
          job,
          job.attempts < 3 ? JobStatus.PENDING : JobStatus.FAILED,
          "Daily stock scan failed.",
          new Date(now.getTime() + 60000),
        );
        throw new Error(
          "Daily stock scan failed; inspect maintenance job status.",
        );
      }
    }
  }
  if (due(2) && process.env.DAILY_BACKUP_ENABLED === "true") {
    if (
      !process.env.BACKUP_DIRECTORY ||
      Buffer.from(process.env.BACKUP_KEY ?? "", "base64").length !== 32
    )
      throw new Error(
        "Daily backup requires BACKUP_DIRECTORY and a valid BACKUP_KEY.",
      );
    const job = await claim(`daily-backup:${date}`, "DAILY_BACKUP", now);
    if (job) {
      try {
        const directory = resolve(process.env.BACKUP_DIRECTORY);
        await mkdir(directory, { recursive: true });
        const file = join(
          directory,
          `daily-${date}-${job.id}-${job.attempts}.msbackup`,
        );
        await new Promise<void>((resolveBackup, reject) => {
          const child = spawn(
            process.execPath,
            ["scripts/backup.mjs", "backup", file],
            {
              windowsHide: true,
              stdio: "ignore",
              env: process.env,
              timeout: 180000,
            },
          );
          child.once("error", reject);
          child.once("exit", (code) =>
            code === 0 ? resolveBackup() : reject(new Error("Backup failed.")),
          );
        });
        await db().job.updateMany({
          where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
          data: { payload: { file, date } },
        });
        await finishJob(job, JobStatus.DONE);
        backup = true;
      } catch {
        await finishJob(
          job,
          job.attempts < 3 ? JobStatus.PENDING : JobStatus.FAILED,
          "Daily backup failed. Check storage and encryption configuration.",
          new Date(now.getTime() + 60000),
        );
        throw new Error("Daily backup failed; inspect maintenance job status.");
      }
    }
  }
  return { scans, backup };
}
