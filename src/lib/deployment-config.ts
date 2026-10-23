// Configuration-only checks; these do not prove deployment or provider delivery.
export function deploymentProblems(env: Record<string, string | undefined>) {
  const problems: string[] = [];
  function publicOrigin(key: string) {
    try {
      const value = new URL(env[key] ?? "");
      if (
        value.protocol !== "https:" ||
        value.username ||
        value.password ||
        value.pathname !== "/" ||
        value.search ||
        value.hash ||
        /^(localhost|127\.|\[::1\])/.test(value.hostname) ||
        /\.(invalid|example|test|localhost|local)$/.test(value.hostname) ||
        /(^|\.)example\.(com|net|org)$/.test(value.hostname)
      )
        throw new Error();
      return value;
    } catch {
      problems.push(
        `${key}: set a real public HTTPS origin without a path or credentials.`,
      );
      return null;
    }
  }
  const app = publicOrigin("APP_URL"),
    auth = publicOrigin("AUTH_URL"),
    receipt = publicOrigin("RECEIPT_PUBLIC_URL");
  if (app && auth && app.origin !== auth.origin)
    problems.push("AUTH_URL must match APP_URL.");
  if (app && receipt && app.hostname === receipt.hostname)
    problems.push(
      "Receipts require a separate hostname from the staff application.",
    );
  for (const key of ["AUTH_SECRET", "RECEIPT_TOKEN_SECRET"])
    if (
      (env[key]?.length ?? 0) < 32 ||
      /placeholder|change.?me/i.test(env[key] ?? "")
    )
      problems.push(
        `${key}: configure a new strong secret of at least 32 characters.`,
      );
  try {
    const database = new URL(env.DATABASE_URL ?? "");
    if (
      database.protocol !== "mysql:" ||
      !database.username ||
      !database.password ||
      /^\/(sys|mysql|information_schema|performance_schema)?$/i.test(
        database.pathname,
      )
    )
      throw new Error();
    if (decodeURIComponent(database.username).split(".").at(-1) === "root")
      problems.push(
        "DATABASE_URL: use a restricted application account, not the administrative account.",
      );
    if (database.searchParams.get("sslaccept") !== "strict")
      problems.push("DATABASE_URL: strict TLS verification is required.");
  } catch {
    problems.push(
      "DATABASE_URL: configure a dedicated MySQL/TiDB application database.",
    );
  }
  if (env.LOCAL_PREVIEW !== "false")
    problems.push("LOCAL_PREVIEW must be false for deployment.");
  if (env.ALLOW_DEMO_SEED === "true")
    problems.push("ALLOW_DEMO_SEED must be false for deployment.");
  if (
    env.DAILY_BACKUP_ENABLED !== "true" ||
    !env.BACKUP_DIRECTORY ||
    !/^[A-Za-z0-9+/]{43}=$/.test(env.BACKUP_KEY ?? "")
  )
    problems.push(
      "Backups require DAILY_BACKUP_ENABLED=true, durable BACKUP_DIRECTORY and a 32-byte base64 BACKUP_KEY.",
    );
  if (env.SMS_SEND_ENABLED !== "true")
    problems.push(
      "Live SMS is disabled; provider delivery remains unverified.",
    );
  if (!env.SMSGATE_USERNAME || !env.SMSGATE_PASSWORD)
    problems.push("SMSGate account credentials are missing.");
  try {
    if (
      new URL(env.SMSGATE_URL ?? "https://api.sms-gate.app/3rdparty/v1")
        .protocol !== "https:"
    )
      throw new Error();
  } catch {
    problems.push("SMSGATE_URL must use HTTPS.");
  }
  return problems;
}
