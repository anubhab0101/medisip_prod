import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { pagination } from "@/lib/validation";
import { ActionForm } from "@/components/shared/action-form";
import {
  PageTitle,
  Empty,
  ListToolbar,
  Pagination,
} from "@/components/shared/page";
import { updateDeliveryAction } from "@/features/delivery/actions";
import { deliveryStatuses } from "@/features/delivery/service";
export default async function Deliveries({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.BILL);
  const params = await searchParams;
  const { q, page } = pagination.parse(params);
  const filter = deliveryStatuses.find((s) => s === params.filter) ?? "";
  const where = {
    branchId: ctx.branch.id,
    ...(filter ? { status: filter } : {}),
    OR: [
      { address: { contains: q } },
      { phone: { contains: q } },
      { assignedTo: { contains: q } },
    ],
  };
  const [rows, count] = await Promise.all([
    db().delivery.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().delivery.count({ where }),
  ]);
  const sales = await db().sale.findMany({
    where: { branchId: ctx.branch.id, id: { in: rows.map((r) => r.saleId) } },
    select: { id: true, invoiceNo: true },
  });
  return (
    <>
      <PageTitle
        title="Deliveries"
        description="Pack, assign and track home deliveries. Add a delivery from a saved bill."
        action={
          <Link className="button secondary" href="/bills">
            <T>{"Bills"}</T>
          </Link>
        }
      />
      <nav className="tabs">
        <Link href="/deliveries">
          <T>{"All"}</T>
        </Link>
        {deliveryStatuses.map((s) => (
          <Link key={s} href={`/deliveries?filter=${s}`}>
            {s.replaceAll("_", " ")}
          </Link>
        ))}
      </nav>
      <ListToolbar
        q={q}
        placeholder="Phone, address or assigned staff"
        filters={{ filter }}
      />
      {!rows.length ? (
        <Empty>
          <T>{"No deliveries found."}</T>
        </Empty>
      ) : (
        rows.map((row) => (
          <details className="panel disclosure" key={row.id}>
            <summary>
              {sales.find((s) => s.id === row.saleId)?.invoiceNo} ·{" "}
              {row.status.replaceAll("_", " ")} · {row.phone}
            </summary>
            <p>{row.address}</p>
            <Link className="text-link" href={`/bills/${row.saleId}`}>
              <T>{"Open bill"}</T>
            </Link>
            <ActionForm action={updateDeliveryAction} label="Update delivery">
              <input type="hidden" name="id" value={row.id} />
              <div className="fields">
                <label>
                  <T>{"Status"}</T>
                  <select name="status" defaultValue={row.status}>
                    {deliveryStatuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <T>{"Assigned to"}</T>
                  <input
                    name="assignedTo"
                    defaultValue={row.assignedTo}
                    maxLength={150}
                  />
                </label>
              </div>
              <label>
                <T>{"Notes"}</T>
                <textarea
                  name="notes"
                  defaultValue={row.notes}
                  maxLength={1000}
                />
              </label>
              <label className="checkbox">
                <input type="checkbox" name="confirmed" />
                <T>
                  {
                    "I confirm delivery completion or cancellation, if selected."
                  }
                </T>
              </label>
            </ActionForm>
          </details>
        ))
      )}
      <Pagination page={page} count={count} q={q} filters={{ filter }} />
    </>
  );
}
