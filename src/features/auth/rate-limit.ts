import "server-only";
import { createHash } from "node:crypto";
import type { LoginAttempt } from "@prisma/client";
import { db } from "@/server/db";
const loginKey = (email: string) =>
  createHash("sha256").update(email.toLowerCase()).digest("hex");
/** Atomic insert plus locking read: simultaneous first attempts cannot race. */
export async function consumeLoginAttempt(email: string) {
  const key = loginKey(email);
  const resetsAt = new Date(Date.now() + 15 * 60_000);
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO LoginAttempt (\`key\`, attempts, resetsAt) VALUES (${key},0,${resetsAt}) ON DUPLICATE KEY UPDATE \`key\`=\`key\``;
    const [row] = await tx.$queryRaw<
      LoginAttempt[]
    >`SELECT * FROM LoginAttempt WHERE \`key\`=${key} FOR UPDATE`;
    if (row.resetsAt <= new Date()) {
      await tx.$executeRaw`UPDATE LoginAttempt SET attempts=1,resetsAt=${resetsAt} WHERE \`key\`=${key}`;
      return true;
    }
    if (row.attempts >= 10) return false;
    await tx.$executeRaw`UPDATE LoginAttempt SET attempts=attempts+1 WHERE \`key\`=${key}`;
    return true;
  });
}
export async function clearLoginAttempts(email: string) {
  await db().loginAttempt.updateMany({
    where: { key: loginKey(email) },
    data: { attempts: 0 },
  });
}
