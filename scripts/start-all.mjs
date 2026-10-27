import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";

const root = process.cwd();
const requiredFiles = [".env.local", ".next/BUILD_ID"];
const missing = requiredFiles.filter((file) => !existsSync(resolve(root, file)));

if (missing.length) {
  console.error(`Cannot start MediShop. Missing: ${missing.join(", ")}`);
  console.error("Create .env.local and build the app first (npm run build).");
  process.exit(1);
}

const localEnv = parseEnv(readFileSync(resolve(root, ".env.local"), "utf8"));
const missingReceiptSettings = ["RECEIPT_DATABASE_URL", "RECEIPT_PUBLIC_URL"].filter(
  (key) => !localEnv[key],
);
if (missingReceiptSettings.length) {
  console.error(
    `Add ${missingReceiptSettings.join(" and ")} to .env.local (use the receipt-only database account).`,
  );
  process.exit(1);
}

const node = process.execPath;
const services = [
  {
    name: "staff app",
    args: ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3000"],
  },
  {
    name: "message worker",
    args: ["--conditions=react-server", "--import", "tsx", "scripts/worker.ts"],
  },
  {
    name: "receipt service",
    args: ["--import", "tsx", "scripts/receipt-server.ts"],
    env: {
      ...Object.fromEntries(
        [
          "PATH",
          "HOME",
          "USER",
          "LOGNAME",
          "TMPDIR",
          "TMP",
          "TEMP",
          "LANG",
          "LC_ALL",
          "TZ",
          "LD_LIBRARY_PATH",
          "SSL_CERT_FILE",
          "SSL_CERT_DIR",
          "NODE_EXTRA_CA_CERTS",
          "SystemRoot",
          "WINDIR",
          "PATHEXT",
          "ComSpec",
        ]
          .filter((key) => process.env[key] !== undefined)
          .map((key) => [key, process.env[key]]),
      ),
      NODE_ENV: "production",
    },
  },
];

const children = new Map();
let stopping = false;

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill("SIGTERM");
  const forceStop = setTimeout(() => {
    for (const child of children.values()) child.kill("SIGKILL");
  }, 5000);
  forceStop.unref();
  setTimeout(() => process.exit(code), 5200).unref();
}

for (const service of services) {
  const child = spawn(node, service.args, {
    cwd: root,
    env:
      service.env ?? {
        ...process.env,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    stdio: ["inherit", "pipe", "pipe"],
  });
  children.set(service.name, child);

  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    let remainder = "";
    stream.on("data", (chunk) => {
      const lines = (remainder + chunk).split(/\r?\n/);
      remainder = lines.pop() ?? "";
      for (const line of lines) if (line) console.log(`[${service.name}] ${line}`);
    });
    stream.on("end", () => {
      if (remainder) console.log(`[${service.name}] ${remainder}`);
    });
  }

  child.on("error", (error) => {
    console.error(`[${service.name}] Could not start: ${error.message}`);
    stopAll(1);
  });
  child.on("exit", (code, signal) => {
    children.delete(service.name);
    if (!stopping) {
      console.error(
        `[${service.name}] stopped${signal ? ` (${signal})` : ` (exit ${code})`}; stopping the other services.`,
      );
      stopAll(code || 1);
    }
  });
}

console.log("Starting staff app, message worker, and isolated receipt service.");
console.log("Press Ctrl+C to stop all three.");
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
