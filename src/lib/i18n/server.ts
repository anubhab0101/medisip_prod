import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { localeCookie, parseLocale } from "./locale";
export const getLocale = cache(async () =>
  parseLocale((await cookies()).get(localeCookie)?.value),
);
