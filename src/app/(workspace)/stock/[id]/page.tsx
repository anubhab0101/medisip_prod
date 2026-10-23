import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { PageTitle } from "@/components/shared/page";
import { ActionForm } from "@/components/shared/action-form";
import { batchAction } from "@/features/stock/batch-actions";
export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await context(Permission.STOCK_WRITE);
  const { id } = await params;
  const batch = await db().batch.findFirst({
    where: { id, branchId: ctx.branch.id },
    include: { medicine: true },
  });
  if (!batch) notFound();
  return (
    <>
      <PageTitle
        title={batch.medicine.name}
        description={`Batch ${batch.batchNo}`}
        action={
          <Link href="/stock" className="button secondary">
            <T>{"Stock"}</T>
          </Link>
        }
      />
      <section className="panel">
        <ActionForm action={batchAction} label="Save batch details">
          <input type="hidden" name="id" value={id} />
          <div className="fields">
            <label>
              <T>{"Batch number"}</T>
              <input
                name="batchNo"
                defaultValue={batch.batchNo}
                maxLength={100}
                required
              />
            </label>
            <label>
              <T>{"Expiry month"}</T>
              <input
                type="month"
                name="expiryMonth"
                defaultValue={batch.expiryDate.toISOString().slice(0, 7)}
                required
              />
            </label>
            <label>
              <T>{"MRP per unit (₹)"}</T>
              <input
                name="mrp"
                inputMode="decimal"
                defaultValue={(batch.mrpPaise / 100).toFixed(2)}
                required
              />
            </label>
            <label>
              <T>{"Cost per unit (₹)"}</T>
              <input
                name="cost"
                inputMode="decimal"
                defaultValue={(batch.purchasePricePaise / 100).toFixed(2)}
                required
              />
            </label>
            <label>
              <T>{"Reason"}</T>
              <input name="reason" minLength={3} maxLength={300} required />
            </label>
          </div>
          <label className="checkbox">
            <input type="checkbox" name="confirmed" required />
            <T>{"I checked these details against the physical stock."}</T>
          </label>
        </ActionForm>
      </section>
    </>
  );
}
