try {
  process.loadEnvFile(".env.local");
} catch {}
async function main() {
  const { workOnce, pollStatuses } = await import("../src/server/jobs/worker");
  const { db } = await import("../src/server/db");
  const { runMaintenance } = await import("../src/server/jobs/maintenance");
  const maintenanceOnly = process.argv.includes("--maintenance-only");
  if (process.argv.includes("--once")) {
    console.log(await runMaintenance());
    if (!maintenanceOnly && process.env.SMS_SEND_ENABLED === "true") {
      await workOnce();
      await pollStatuses();
    }
    await db().$disconnect();
    return;
  }
  let stopping = false;
  let maintenanceAt = 0;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  console.log(
    "MediShop worker started. SMS sending follows the local configuration.",
  );
  while (!stopping) {
    let worked = false;
    try {
      if (Date.now() >= maintenanceAt) {
        await runMaintenance();
        maintenanceAt = Date.now() + 60000;
      }
      for (
        let i = 0;
        i < 20 &&
        !stopping &&
        !maintenanceOnly &&
        process.env.SMS_SEND_ENABLED === "true";
        i++
      ) {
        if (!(await workOnce())) break;
        worked = true;
      }
      if (!maintenanceOnly) await pollStatuses();
    } catch {
      console.error(
        "Worker task failed. Check database, backup storage and job status. Retrying shortly.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, worked ? 1000 : 10000));
  }
  await db().$disconnect();
}
main().catch(() => {
  console.error("Worker startup failed. Check configuration.");
  process.exitCode = 1;
});
