import "server-only";
import { randomUUID } from "node:crypto";
import { JobStatus, type Job } from "@prisma/client";
import { transaction } from "@/server/transaction";
import { db } from "@/server/db";
import { signJobPayload } from "@/lib/job-signature";

export async function createJob(
  key: string,
  type: string,
  payload: Record<string, unknown>,
  runAt: Date = new Date(),
) {
  const signedPayload = { ...payload, _sig: signJobPayload(payload) };
  return db().job.create({
    data: { key, type, payload: signedPayload, runAt, status: JobStatus.PENDING },
  });
}

export async function claimJob() {
  return transaction(async (tx) => {
    const now = new Date();
    const [job] = await tx.$queryRaw<
      Job[]
    >`SELECT * FROM Job WHERE type NOT IN ('DAILY_STOCK_SCAN','DAILY_BACKUP') AND ((status='PENDING' AND runAt<=${now}) OR (status='RUNNING' AND leaseUntil<${now})) ORDER BY runAt,id LIMIT 1 FOR UPDATE`;
    if (!job) return null;
    const leaseToken = randomUUID();
    return tx.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.RUNNING,
        leaseUntil: new Date(Date.now() + 120000),
        leaseToken,
        attempts: { increment: 1 },
      },
    });
  });
}
export async function finishJob(
  job: Job,
  status: JobStatus,
  error?: string,
  runAt?: Date,
) {
  return db().job.updateMany({
    where: {
      id: job.id,
      leaseToken: job.leaseToken,
      status: JobStatus.RUNNING,
    },
    data: {
      status,
      lastError: error ?? null,
      runAt: runAt ?? job.runAt,
      leaseUntil: null,
      leaseToken: null,
    },
  });
}
