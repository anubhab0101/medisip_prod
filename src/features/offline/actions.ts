"use server";
import { saveResult } from "@/server/forms";
import { prepareOffline } from "./service";
export async function prepareOfflineAction(raw: unknown) {
  let bundle: Awaited<ReturnType<typeof prepareOffline>> | undefined;
  const result = await saveResult(
    async () => {
      bundle = await prepareOffline(raw);
    },
    ["/stock", "/billing", "/offline"],
    "Stock reserved.",
  );
  return { ...result, bundle };
}
