import { it, expect } from "vitest";
import { deploymentProblems } from "../src/lib/deployment-config";
const configured = {
  APP_URL: "https://staff.pharmacy.in",
  AUTH_URL: "https://staff.pharmacy.in",
  RECEIPT_PUBLIC_URL: "https://receipts.pharmacy.in",
  AUTH_SECRET: "a".repeat(48),
  RECEIPT_TOKEN_SECRET: "b".repeat(48),
  JOB_SIGNATURE_KEY: "c".repeat(48),
  DATABASE_URL:
    "mysql://tenant.app:password@db.pharmacy.test:4000/pharmacy?sslaccept=strict",
  LOCAL_PREVIEW: "false",
  ALLOW_DEMO_SEED: "false",
  DAILY_BACKUP_ENABLED: "true",
  BACKUP_DIRECTORY: "/backups",
  BACKUP_KEY: Buffer.alloc(32).toString("base64"),
  PLATFORM_ADMIN_EMAILS: "admin@pharmacy.in",
  INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  SMS_SEND_ENABLED: "true",
};
it("accepts structurally configured deployment without claiming external verification", () =>
  expect(deploymentProblems(configured)).toEqual([]));
it("rejects local origins, same-host receipts, root accounts and missing TLS", () => {
  expect(
    deploymentProblems({
      ...configured,
      APP_URL: "http://127.0.0.1:3000",
    }).join(" "),
  ).toContain("APP_URL");
  const problems = deploymentProblems({
    ...configured,
    RECEIPT_PUBLIC_URL: configured.APP_URL,
    DATABASE_URL: "mysql://tenant.root:password@db.test/sys",
    LOCAL_PREVIEW: "true",
  }).join(" ");
  expect(problems).toContain("separate hostname");
  expect(problems).toContain("dedicated");
  expect(problems).toContain("LOCAL_PREVIEW");
  expect(
    deploymentProblems({
      ...configured,
      DATABASE_URL: "mysql://tenant.root:password@db.test/shop",
    }).join(" "),
  ).toContain("restricted application account");
  expect(
    deploymentProblems({
      ...configured,
      DATABASE_URL: "mysql://tenant.app:password@db.test/shop",
    }).join(" "),
  ).toContain("strict TLS");
});
it("reports missing encryption and backup configuration without leaking secrets", () => {
  const problems = deploymentProblems({
    ...configured,
    SMS_SEND_ENABLED: "false",
    BACKUP_KEY: "private-invalid-secret",
    INTEGRATION_ENCRYPTION_KEY: "private-invalid-secret",
  }).join(" ");
  expect(problems).toContain("INTEGRATION_ENCRYPTION_KEY");
  expect(problems).not.toContain("private-invalid-secret");
  expect(deploymentProblems({ ...configured, PLATFORM_ADMIN_EMAILS: "admin@example.com" }).join(" ")).toContain("PLATFORM_ADMIN_EMAILS");
});
