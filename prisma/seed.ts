import { loadEnvConfig } from "@next/env";
import { PrismaClient, Role, Schedule, MovementType } from "@prisma/client";
import { hash } from "bcryptjs";
loadEnvConfig(process.cwd());
const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_OWNER_PASSWORD;
if (!email || !password || password.length < 12 || password.length > 72)
  throw new Error(
    "Set SEED_OWNER_EMAIL and a 12–72 character SEED_OWNER_PASSWORD in .env.local.",
  );
const prisma = new PrismaClient();
async function main() {
  if (await prisma.user.count())
    throw new Error(
      "Seed is only allowed on an empty database. Existing data was not changed.",
    );
  const ownerHash = await hash(password!, 12);
  const sample = process.env.ALLOW_DEMO_SEED === "true";
  const samplePassword = process.env.SEED_SAMPLE_PASSWORD;
  if (
    sample &&
    (!samplePassword ||
      samplePassword.length < 12 ||
      samplePassword.length > 72)
  )
    throw new Error(
      "Sample users require a separate 12–72 character SEED_SAMPLE_PASSWORD.",
    );
  const sampleHash = sample ? await hash(samplePassword!, 12) : "";
  await prisma.$transaction(
    async (tx) => {
      const branch = await tx.branch.create({
        data: {
          name: sample ? "Practice pharmacy" : "My pharmacy",
          address: "",
          phone: "",
          demo: sample,
        },
      });
      const owner = await tx.user.create({
        data: {
          name: "Owner",
          email: email!,
          passwordHash: ownerHash,
          memberships: { create: { branchId: branch.id, role: Role.OWNER } },
        },
      });
      if (!sample) return;
      for (const [name, role] of [
        ["Pharmacist", Role.PHARMACIST],
        ["Cashier", Role.CASHIER],
      ] as const)
        await tx.user.create({
          data: {
            name,
            email: `${name.toLowerCase()}@demo.invalid`,
            passwordHash: sampleHash,
            memberships: { create: { branchId: branch.id, role } },
          },
        });
      const supplier = await tx.supplier.create({
        data: { branchId: branch.id, name: "Practice supplier" },
      });
      for (let i = 1; i <= 30; i++) {
        const medicine = await tx.medicine.create({
          data: {
            name: `Practice medicine ${String(i).padStart(2, "0")}`,
            genericName: `Sample ingredient ${Math.ceil(i / 3)}`,
            strength: "500 mg",
            schedule: Schedule.NONE,
            branchSettings: {
              create: { branchId: branch.id, reorderLevel: 10 },
            },
          },
        });
        const batch = await tx.batch.create({
          data: {
            branchId: branch.id,
            medicineId: medicine.id,
            batchNo: `DEMO-${i}`,
            expiryDate: new Date(
              Date.UTC(new Date().getUTCFullYear() + 2, 11, 31),
            ),
            qtyOnHand: 50,
            purchasePricePaise: 800,
            mrpPaise: 1000,
            supplierId: supplier.id,
          },
        });
        await tx.stockMovement.create({
          data: {
            branchId: branch.id,
            batchId: batch.id,
            type: MovementType.PURCHASE,
            quantity: 50,
            reason: "Isolated practice opening stock",
            userId: owner.id,
            refId: "seed",
          },
        });
      }
      for (const name of ["Practice doctor A", "Practice doctor B"])
        await tx.doctor.create({
          data: {
            branchId: branch.id,
            name,
            specialization: "General",
            feePaise: 0,
            availability: {
              create: [
                { weekday: 1, startMinute: 540, endMinute: 780 },
                { weekday: 3, startMinute: 540, endMinute: 780 },
              ],
            },
          },
        });
    },
    { timeout: 60000 },
  );
  console.log(
    sample
      ? "Isolated practice shop seeded. No real medicine or tax catalogue was provided."
      : "Owner and empty shop created. Sign in to finish shop details.",
  );
}
main()
  .catch(() => {
    console.error(
      "Seed failed. Verify configuration and that this is an empty development database. No credentials are printed.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
