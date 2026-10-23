import { deploymentProblems } from "../src/lib/deployment-config";
const file = process.argv[2];
try {
  process.loadEnvFile(file ?? ".env.local");
} catch {
  if (file) {
    console.error("Could not load the requested environment file.");
    process.exit(1);
  }
}
const problems = deploymentProblems(process.env);
for (const problem of problems) console.log(`NEEDS SETUP: ${problem}`);
console.log(
  problems.length
    ? `${problems.length} configuration checks need attention. Local preview may still be used.`
    : "Configuration checks passed. Still verify DNS/TLS, restricted database grants, provider delivery, off-host backup recovery and container operation before launch.",
);
process.exitCode = problems.length ? 1 : 0;
