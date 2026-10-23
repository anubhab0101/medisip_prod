import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
await build({
  entryPoints: ["src/features/offline/shell.ts"],
  bundle: true,
  platform: "browser",
  target: "es2022",
  outfile: "public/offline-shell/app.js",
  minify: true,
});
console.log("Offline counter bundle prepared.");

const version = createHash("sha256").update(await readFile("public/offline-shell/app.js")).update(await readFile("public/offline-shell/index.html")).digest("hex").slice(0,12);
const sw = await readFile("public/offline-shell/sw.js", "utf8");
await writeFile("public/offline-shell/sw.js", sw.replace(/medishop-offline-shell-[a-z0-9]+/g, `medishop-offline-shell-${version}`));
