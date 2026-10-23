import { Prisma, PrismaClient } from "@prisma/client";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
try {
  process.loadEnvFile(".env.local");
} catch {}
const mode = process.argv[2];
const file = process.argv[3];
if (!["backup", "restore"].includes(mode) || !file)
  throw new Error(
    "Usage: node scripts/backup.mjs backup|restore <encrypted-file>",
  );
const key = Buffer.from(process.env.BACKUP_KEY ?? "", "base64");
if (key.length !== 32)
  throw new Error(
    "Set BACKUP_KEY to a protected 32-byte base64 key. Keep a separate secure copy.",
  );
const schemaHash = createHash("sha256")
  .update(await readFile("prisma/schema.prisma"))
  .digest("hex");
const models = Prisma.dmmf.datamodel.models;
const delegate = (m) => m.name[0].toLowerCase() + m.name.slice(1);
const url =
  mode === "restore"
    ? process.env.RESTORE_DATABASE_URL
    : process.env.DATABASE_URL;
if (!url) throw new Error("Database connection is missing.");
if (
  mode === "restore" &&
  (!/^\/medishop_restore_[a-z0-9_]+$/.test(new URL(url).pathname) ||
    url === process.env.DATABASE_URL)
)
  throw new Error(
    "Restore requires a separate empty medishop_restore_* database.",
  );
const client = new PrismaClient({ datasourceUrl: url });
const fingerprint = (rows) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        rows
          .map((r) =>
            Object.fromEntries(
              Object.entries(r).sort(([a], [b]) => a.localeCompare(b)),
            ),
          )
          .map((r) => JSON.stringify(r))
          .sort(),
      ),
    )
    .digest("hex");
try {
  if (mode === "backup") {
    const tables = await client.$transaction(
      async (tx) => {
        const result = {};
        for (const m of models) {
          const rows = await tx[delegate(m)].findMany({ take: 100001 });
          if (rows.length > 100000)
            throw new Error("Use TiDB managed backups for larger databases.");
          result[m.name] = rows;
        }
        return result;
      },
      { isolationLevel: "RepeatableRead", timeout: 120000, maxWait: 10000 },
    );
    const bytes = Buffer.from(
      JSON.stringify({
        version: 1,
        schemaHash,
        createdAt: new Date().toISOString(),
        tables,
      }),
    );
    if (bytes.length > 100 * 1024 * 1024)
      throw new Error("Use TiDB managed backups for larger databases.");
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    await mkdir(".local/backups", { recursive: true });
    await writeFile(
      file,
      Buffer.concat([Buffer.from("MSBK1"), iv, cipher.getAuthTag(), encrypted]),
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      `Encrypted snapshot saved: ${models.length} tables, ${Object.values(tables).reduce((n, r) => n + r.length, 0)} rows.`,
    );
  } else {
    const encrypted = await readFile(file);
    if (
      encrypted.length > 110 * 1024 * 1024 ||
      encrypted.subarray(0, 5).toString() !== "MSBK1"
    )
      throw new Error("Invalid backup format.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      encrypted.subarray(5, 17),
    );
    decipher.setAuthTag(encrypted.subarray(17, 33));
    const snapshot = JSON.parse(
      Buffer.concat([
        decipher.update(encrypted.subarray(33)),
        decipher.final(),
      ]).toString(),
    );
    if (snapshot.version !== 1 || snapshot.schemaHash !== schemaHash)
      throw new Error(
        "Restore with the exact schema version used to create this backup.",
      );
    if (
      Object.keys(snapshot.tables).sort().join() !==
      models
        .map((m) => m.name)
        .sort()
        .join()
    )
      throw new Error("Backup table list does not match the schema.");
    const ordered = [];
    while (ordered.length < models.length) {
      const ready = models.filter(
        (m) =>
          !ordered.includes(m) &&
          m.fields
            .filter((f) => f.relationFromFields?.length)
            .every((f) => ordered.some((o) => o.name === f.type)),
      );
      if (!ready.length) throw new Error("Unresolved schema dependency.");
      ordered.push(...ready);
    }
    await client.$transaction(
      async (tx) => {
        for (const m of models)
          if (await tx[delegate(m)].count())
            throw new Error(
              "Restore target must be empty. Nothing was changed.",
            );
        for (const m of ordered) {
          const rows = snapshot.tables[m.name].map((row) => {
            const result = { ...row };
            for (const f of m.fields) {
              if (
                f.type === "DateTime" &&
                result[f.name] !== null &&
                result[f.name] !== undefined
              )
                result[f.name] = new Date(result[f.name]);
              if (f.type === "Json" && result[f.name] === null)
                result[f.name] = f.isRequired ? Prisma.JsonNull : Prisma.DbNull;
            }
            return result;
          });
          for (let i = 0; i < rows.length; i += 100)
            await tx[delegate(m)].createMany({ data: rows.slice(i, i + 100) });
        }
      },
      { timeout: 600000, maxWait: 10000 },
    );
    for (const m of models) {
      const rows = JSON.parse(
        JSON.stringify(await client[delegate(m)].findMany()),
      );
      if (fingerprint(rows) !== fingerprint(snapshot.tables[m.name]))
        throw new Error(`Restored table verification failed: ${m.name}`);
    }
    console.log(
      `Restore verified: all ${models.length} tables match the decrypted snapshot.`,
    );
  }
} finally {
  await client.$disconnect();
}
