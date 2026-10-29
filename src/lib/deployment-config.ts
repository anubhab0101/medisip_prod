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
  for (const key of ["AUTH_SECRET", "RECEIPT_TOKEN_SECRET", "JOB_SIGNATURE_KEY"])
    if (
      (env[key]?.length ?? 0) < 32 ||
      /placeholder|change.?me/i.test(env[key] ?? "")
    )
      problems.push(
        `${key}: configure a new strong secret of at least 32 characters.`,
      );
  if (
    !env.PLATFORM_ADMIN_EMAILS?.split(",").some((email) => {
      const normalized = email.trim().toLowerCase();
      return (
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) &&
        !/(example\.(com|net|org)|\.test)$/.test(normalized)
      );
    })
  )
    problems.push(
      "PLATFORM_ADMIN_EMAILS: add at least one administrator email.",
    );
  if (!/^[A-Za-z0-9+/]{43}=$/.test(env.INTEGRATION_ENCRYPTION_KEY ?? ""))
    problems.push(
      "INTEGRATION_ENCRYPTION_KEY: configure a base64 32-byte key shared by staff and worker processes.",
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
  if (env.SINGLE_SERVICE_MODE === "true") {
    if (env.DAILY_BACKUP_ENABLED === "true")
      problems.push(
        "SINGLE_SERVICE_MODE uses ephemeral storage; local backup files are not durable. Keep DAILY_BACKUP_ENABLED=false and configure off-host backups separately.",
      );
  } else if (
    env.DAILY_BACKUP_ENABLED !== "true" ||
    !env.BACKUP_DIRECTORY ||
    !/^[A-Za-z0-9+/]{43}=$/.test(env.BACKUP_KEY ?? "")
  ) {
    problems.push(
      "Backups require DAILY_BACKUP_ENABLED=true, durable BACKUP_DIRECTORY and a 32-byte base64 BACKUP_KEY.",
    );
  }
  // Provider kill switches may intentionally remain off until a shop is configured and tested.
  return problems;
}
