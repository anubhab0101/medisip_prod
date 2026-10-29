import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createServer, request as httpRequest } from "node:http";
import { createConnection } from "node:net";
import { resolve } from "node:path";

const root = process.cwd();
const envFile = resolve(root, ".env.local");
const fileEnv = existsSync(envFile)
  ? parseEnv(readFileSync(envFile, "utf8"))
  : {};
const env = { ...fileEnv, ...process.env };
const singleService = env.SINGLE_SERVICE_MODE === "true";
const requiredFiles = singleService
  ? [".next/BUILD_ID"]
  : [".env.local", ".next/BUILD_ID"];
const missing = requiredFiles.filter(
  (file) => !existsSync(resolve(root, file)),
);
if (missing.length) {
  console.error(`Cannot start MediShop. Missing: ${missing.join(", ")}`);
  console.error(
    singleService
      ? "Build the app first (npm run build)."
      : "Create .env.local and build the app first (npm run build).",
  );
  process.exit(1);
}

const required = [
  "DATABASE_URL",
  "APP_URL",
  "AUTH_URL",
  "AUTH_SECRET",
  "RECEIPT_DATABASE_URL",
  "RECEIPT_PUBLIC_URL",
];
const unset = required.filter((key) => !env[key]);
if (unset.length) {
  console.error(
    `Configure these environment values before starting: ${unset.join(", ")}`,
  );
  process.exit(1);
}

let staffHosts = new Set();
let receiptHost = "";
if (singleService) {
  try {
    const app = new URL(env.APP_URL);
    const auth = new URL(env.AUTH_URL);
    const receipt = new URL(env.RECEIPT_PUBLIC_URL);
    if (
      app.protocol !== "https:" ||
      app.pathname !== "/" ||
      app.search ||
      app.hash ||
      app.username ||
      app.password ||
      auth.protocol !== "https:" ||
      auth.pathname !== "/" ||
      auth.search ||
      auth.hash ||
      auth.username ||
      auth.password ||
      auth.origin !== app.origin ||
      receipt.protocol !== "https:" ||
      receipt.pathname !== "/" ||
      receipt.search ||
      receipt.hash ||
      receipt.username ||
      receipt.password ||
      app.hostname === receipt.hostname
    ) {
      throw new Error(
        "Use separate HTTPS staff and receipt hostnames; AUTH_URL must match APP_URL.",
      );
    }
    staffHosts.add(app.hostname.toLowerCase());
    if (env.RENDER_EXTERNAL_HOSTNAME)
      staffHosts.add(env.RENDER_EXTERNAL_HOSTNAME.toLowerCase());
    for (const alias of (env.STAFF_HOST_ALIASES ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean))
      staffHosts.add(alias);
    receiptHost = receipt.hostname.toLowerCase();
    if (staffHosts.has(receiptHost))
      throw new Error(
        "Receipt hostname must be separate from every staff hostname.",
      );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Invalid public host configuration.",
    );
    process.exit(1);
  }
} else {
  const missingReceipt = ["RECEIPT_DATABASE_URL", "RECEIPT_PUBLIC_URL"].filter(
    (key) => !env[key],
  );
  if (missingReceipt.length) {
    console.error(
      `Add ${missingReceipt.join(" and ")} to .env.local (use the receipt-only database account).`,
    );
    process.exit(1);
  }
}

const node = process.execPath;
const portApp = singleService ? 3100 : 3000;
const portReceipts = singleService ? 3200 : 3002;
const portWorkerHealth = singleService ? 3301 : 0;
const staffEnv = {
  ...env,
  NODE_ENV: "production",
  PORT: String(portApp),
  NEXT_TELEMETRY_DISABLED: "1",
  ...(singleService ? { HOME: "/home/node", TMPDIR: "/tmp" } : {}),
};
const workerEnv = {
  ...env,
  NODE_ENV: "production",
  ...(singleService ? { WORKER_HEALTH_PORT: String(portWorkerHealth) } : {}),
  ...(singleService ? { HOME: "/home/node", TMPDIR: "/tmp" } : {}),
};
// Keep the receipt reader's database credential out of the staff and worker processes.
delete staffEnv.RECEIPT_DATABASE_URL;
delete workerEnv.RECEIPT_DATABASE_URL;
const services = [
  {
    name: "staff app",
    args: [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(portApp),
    ],
    env: staffEnv,
  },
  {
    name: "message worker",
    args: ["--conditions=react-server", "--import", "tsx", "scripts/worker.ts"],
    env: workerEnv,
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
          .filter((key) => env[key] !== undefined)
          .map((key) => [key, env[key]]),
      ),
      NODE_ENV: "production",
      HOME: "/tmp",
      TMPDIR: "/tmp",
      RECEIPT_DATABASE_URL: env.RECEIPT_DATABASE_URL,
      RECEIPT_PUBLIC_URL: env.RECEIPT_PUBLIC_URL,
      RECEIPT_PORT: String(portReceipts),
      RECEIPT_BIND: "127.0.0.1",
    },
  },
];

const children = new Map();
let stopping = false;
let gateway;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  gateway?.close();
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
    env: service.env,
    ...(singleService && service.name === "receipt service"
      ? {
          uid: Number(env.RECEIPT_UID ?? 1001),
          gid: Number(env.RECEIPT_GID ?? 1001),
        }
      : singleService
        ? {
            uid: Number(env.STAFF_UID ?? 1000),
            gid: Number(env.STAFF_GID ?? 1000),
          }
        : {}),
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.set(service.name, child);
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    let remainder = "";
    stream.on("data", (chunk) => {
      const lines = (remainder + chunk).split(/\r?\n/);
      remainder = lines.pop() ?? "";
      for (const line of lines)
        if (line) console.log(`[${service.name}] ${line}`);
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

if (singleService) {
  async function waitForPort(port, serviceName, timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (stopping) throw new Error("Startup interrupted.");
      for (const [name, child] of children)
        if (child.exitCode !== null)
          throw new Error(`${name} exited before startup completed.`);
      const ready = await new Promise((resolveReady) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          resolveReady(true);
        });
        socket.once("error", () => resolveReady(false));
      });
      if (ready) return;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    throw new Error(`${serviceName} did not become ready in time.`);
  }
  try {
    await Promise.all([
      waitForPort(portApp, "Staff app"),
      waitForPort(portReceipts, "Receipt service"),
      waitForPort(portWorkerHealth, "Worker health endpoint"),
    ]);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Service startup failed.",
    );
    stopAll(1);
  }
  if (!stopping) {
    const publicPort = Number(env.PORT ?? 10000);
    gateway = createServer((incoming, outgoing) => {
      const rawHost = incoming.headers.host ?? "";
      let hostname = "";
      try {
        hostname = new URL(`http://${rawHost}`).hostname.toLowerCase();
      } catch {}
      let requestPath = incoming.url ?? "/";
      let targetPort = hostname === receiptHost ? portReceipts : 0;
      let upstreamHost = rawHost;
      if (staffHosts.has(hostname)) {
        let pathname = "";
        try {
          pathname = new URL(requestPath, "http://gateway.internal").pathname;
        } catch {}
        const healthRoutes = {
          "/health/staff": { port: portApp, path: "/api/health" },
          "/health/worker": { port: portWorkerHealth, path: "/health" },
          "/health/receipt": {
            port: portReceipts,
            path: "/health",
            host: receiptHost,
          },
        };
        const healthRoute = healthRoutes[pathname];
        if (healthRoute) {
          targetPort = healthRoute.port;
          requestPath = healthRoute.path;
          upstreamHost = healthRoute.host ?? rawHost;
        } else {
          targetPort = portApp;
        }
      }
      if (!targetPort) {
        outgoing.writeHead(421, {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        });
        outgoing.end("This host is not configured.");
        return;
      }
      const headers = { ...incoming.headers };
      for (const key of [
        "connection",
        "proxy-connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
      ])
        delete headers[key];
      headers.host = upstreamHost;
      const upstream = httpRequest(
        {
          hostname: "127.0.0.1",
          port: targetPort,
          method: incoming.method,
          path: requestPath,
          headers,
          timeout: 60000,
        },
        (response) => {
          outgoing.writeHead(
            response.statusCode ?? 502,
            response.statusMessage,
            response.headers,
          );
          response.pipe(outgoing);
        },
      );
      upstream.on("timeout", () =>
        upstream.destroy(new Error("Upstream timeout")),
      );
      upstream.on("error", () => {
        if (!outgoing.headersSent)
          outgoing.writeHead(503, {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
          });
        outgoing.end("Service temporarily unavailable.");
      });
      incoming.pipe(upstream);
    });
    gateway.headersTimeout = 70000;
    gateway.requestTimeout = 65000;
    gateway.on("error", (error) => {
      console.error(`Public gateway failed: ${error.message}`);
      stopAll(1);
    });
    gateway.listen(publicPort, "0.0.0.0", () => {
      console.log(`Unified MediShop service listening on port ${publicPort}.`);
      console.log(
        "Staff and receipt requests are routed by hostname; the receipt host never falls back to the staff app.",
      );
      const appOrigin = new URL(env.APP_URL).origin;
      const healthPaths = [
        "/health/staff",
        "/health/worker",
        "/health/receipt",
      ];
      console.log(
        `Health URLs: ${healthPaths.map((path) => `${appOrigin}${path}`).join(" · ")} · ${new URL(env.RECEIPT_PUBLIC_URL).origin}/health`,
      );
      console.log("Health checks run at startup and every 60 seconds.");
      let checkingHealth = false;
      const pingHealth = (path) =>
        new Promise((resolvePing) => {
          let settled = false;
          const finish = (ok, detail = "") => {
            if (settled) return;
            settled = true;
            resolvePing({ path, ok, detail });
          };
          const request = httpRequest(
            {
              hostname: "127.0.0.1",
              port: publicPort,
              method: "GET",
              path,
              headers: { host: new URL(env.APP_URL).host },
            },
            (response) => {
              response.resume();
              finish(
                response.statusCode === 200,
                `HTTP ${response.statusCode ?? "unknown"}`,
              );
            },
          );
          request.setTimeout(5000, () => request.destroy(new Error("timeout")));
          request.on("error", (error) => finish(false, error.message));
          request.end();
        });
      const checkServices = async () => {
        if (checkingHealth || stopping) return;
        checkingHealth = true;
        try {
          const results = await Promise.all(healthPaths.map(pingHealth));
          for (const result of results)
            if (!result.ok)
              console.error(`[health] ${result.path} failed: ${result.detail}`);
        } finally {
          checkingHealth = false;
        }
      };
      void checkServices();
      const healthTimer = setInterval(checkServices, 60000);
      healthTimer.unref();
    });
  }
} else {
  console.log(
    "Starting staff app, message worker, and isolated receipt service.",
  );
  console.log(
    "Staff: http://127.0.0.1:3000 · Receipt viewer: http://127.0.0.1:3002",
  );
  console.log("Press Ctrl+C to stop all three.");
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
