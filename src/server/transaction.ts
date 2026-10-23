import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { BusinessError } from "@/lib/errors";
export async function transaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db().$transaction(
        async (tx) => {
          const settings = await tx.$queryRaw<
            { mode: string }[]
          >`SELECT @@tidb_txn_mode AS mode`;
          if (settings[0]?.mode.toLowerCase() !== "pessimistic")
            throw new BusinessError(
              "The shop database needs pessimistic transactions enabled before stock can change.",
            );
          return work(tx);
        },
        { maxWait: 10000, timeout: 20000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
  throw new BusinessError("The shop is busy. Please try again.");
}
