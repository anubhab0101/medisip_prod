import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI can supply DATABASE_URL directly. */
}
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/integration/*.integration.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
