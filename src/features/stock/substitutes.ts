import "server-only";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { id } from "@/lib/validation";
import { shopDate } from "@/lib/date";
import { BusinessError } from "@/lib/errors";
export async function findSubstitutes(raw: unknown) {
  const ctx = await context(Permission.STOCK_READ);
  const medicine = await db().medicine.findFirst({
    where: {
      id: id.parse(raw),
      active: true,
      branchSettings: { some: { branchId: ctx.branch.id, active: true } },
    },
  });
  if (!medicine) throw new BusinessError("Medicine not found in this shop.");
  if (!medicine.genericName.trim() || !medicine.strength.trim())
    return { medicine, matches: [] };
  const matches = await db().medicine.findMany({
    where: {
      id: { not: medicine.id },
      active: true,
      genericName: medicine.genericName,
      strength: medicine.strength,
      dosageForm: medicine.dosageForm,
      packSize: medicine.packSize,
      schedule: medicine.schedule,
      branchSettings: { some: { branchId: ctx.branch.id, active: true } },
    },
    include: {
      batches: {
        where: {
          branchId: ctx.branch.id,
          expiryDate: { gte: new Date(shopDate()) },
          qtyOnHand: { gt: 0 },
        },
      },
    },
    take: 100,
  });
  const available = matches
    .map((m) => {
      const batches = m.batches.filter((b) => b.qtyOnHand > b.qtyReserved);
      return {
        id: m.id,
        name: m.name,
        manufacturer: m.manufacturer,
        price: batches.length
          ? Math.min(...batches.map((b) => b.mrpPaise))
          : null,
        quantity: batches.reduce(
          (sum, b) => sum + b.qtyOnHand - b.qtyReserved,
          0,
        ),
      };
    })
    .filter((m) => m.price !== null)
    .sort((a, b) => a.price! - b.price!);
  return { medicine, matches: available };
}
