import { mkdir, readdir, copyFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("public/ocr/core", { recursive: true });
await mkdir("public/ocr/lang", { recursive: true });
await copyFile("node_modules/tesseract.js/dist/worker.min.js", "public/ocr/worker.min.js");
for (const name of await readdir("node_modules/tesseract.js-core")) if (/^tesseract-core.*\.(wasm|js)$/.test(name)) await copyFile(`node_modules/tesseract.js-core/${name}`, `public/ocr/core/${name}`);
try { await access("public/ocr/lang/eng.traineddata"); } catch {
  const response = await fetch("https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/eng.traineddata");
  if (!response.ok) throw new Error("Could not download the English OCR model.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024 || bytes.length < 100000) throw new Error("Unexpected OCR model size.");
  await writeFile("public/ocr/lang/eng.traineddata", bytes);
  await writeFile("public/ocr/lang/eng.sha256", createHash("sha256").update(bytes).digest("hex") + "\n");
}
console.log("Local OCR worker, core and English model are ready.");
