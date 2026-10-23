import Link from "next/link";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { shopDate } from "@/lib/date";
import { PageTitle } from "@/components/shared/page";
import { OfflinePrepare } from "@/features/offline/prepare-form";
export default async function Offline() {
  const ctx = await context(Permission.BILL);
  const batches = await db().batch.findMany({
    where: {
      branchId: ctx.branch.id,
      qtyOnHand: { gt: 0 },
      expiryDate: { gte: new Date(shopDate()) },
      medicine: {
        active: true,
        schedule: "NONE",
        branchSettings: { some: { branchId: ctx.branch.id, active: true } },
      },
    },
    include: { medicine: true },
    orderBy: { expiryDate: "asc" },
    take: 200,
  });
  return (
    <>
      <PageTitle
        title="Offline counter"
        description="Walk-in bills with reserved stock, discounts and cash or confirmed electronic payments."
        action={
          <Link className="button secondary" href="/billing">
            Online billing
          </Link>
        }
      />
      <section className="panel">
        <p>
          Prepare while connected. Open the counter once before going offline.
          Sync before closing the counter or clearing browser data. Cash,
          confirmed UPI/card, split payments and discounts work offline.
          Customer credit, loyalty and prescriptions use online billing.
        </p>
        <OfflinePrepare
          batches={batches
            .filter((b) => b.qtyOnHand > b.qtyReserved)
            .map((b) => ({
              id: b.id,
              name: `${b.medicine.name} / ${b.batchNo}`,
              available: b.qtyOnHand - b.qtyReserved,
            }))}
        />
      </section>
    </>
  );
}
