import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { MedicineFields } from "@/features/stock/medicine-fields";
import { shopDate } from "@/lib/date";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission, can } from "@/lib/permissions";
import { pagination } from "@/lib/validation";
import { ActionForm } from "@/components/shared/action-form";
import {
  PageTitle,
  ListToolbar,
  Pagination,
  Empty,
} from "@/components/shared/page";
import { medicineAction } from "@/features/stock/actions";
export default async function Medicines({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.STOCK_READ);
  const params = await searchParams;
  const { q, page } = pagination.parse(params);
  const archived = params.filter === "archived";
  const where = {
    active: true,
    branchSettings: { some: { branchId: ctx.branch.id, active: !archived } },
    OR: [
      { name: { contains: q } },
      { genericName: { contains: q } },
      { barcode: { contains: q } },
    ],
  };
  const [items, count] = await Promise.all([
    db().medicine.findMany({
      where,
      include: {
        batches: {
          where: {
            branchId: ctx.branch.id,
            expiryDate: { gte: new Date(shopDate()) },
          },
        },
        branchSettings: { where: { branchId: ctx.branch.id } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().medicine.count({ where }),
  ]);
  return (
    <>
      <PageTitle
        title="Medicines"
        description="Find medicines by name, ingredient or barcode."
        action={
          can(ctx.role, Permission.MEDICINE_WRITE) && (
            <Link className="button secondary" href="/medicines/import">
              <T>{"Import CSV / Excel"}</T>
            </Link>
          )
        }
      />
      {can(ctx.role, Permission.MEDICINE_WRITE) && (
        <details className="panel disclosure">
          <summary>
            <T>{"+ Add medicine"}</T>
          </summary>
          <ActionForm action={medicineAction} label="Add medicine">
            <MedicineFields />
          </ActionForm>
        </details>
      )}
      <nav className="tabs">
        <Link href="/medicines">
          <T>{"Active"}</T>
        </Link>
        <Link href="/medicines?filter=archived">
          <T>{"Archived"}</T>
        </Link>
      </nav>
      <ListToolbar
        q={q}
        placeholder="Name, ingredient or barcode"
        filters={{ filter: params.filter ?? "" }}
      />
      {!items.length ? (
        <Empty>
          <T>{"No medicines found. Add a medicine to get started."}</T>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Medicine"}</T>
                </th>
                <th>
                  <T>{"Ingredient"}</T>
                </th>
                <th>
                  <T>{"Available"}</T>
                </th>
                <th>
                  <T>{"Rack"}</T>
                </th>
                <th>
                  <T>{"Prescription"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link className="text-link" href={`/medicines/${m.id}`}>
                      {m.name}
                    </Link>
                    <small>
                      {m.strength} · {m.packSize}
                    </small>
                  </td>
                  <td>{m.genericName || "—"}</td>
                  <td>
                    {m.batches.reduce(
                      (n, b) => n + b.qtyOnHand - b.qtyReserved,
                      0,
                    )}
                  </td>
                  <td>{m.branchSettings[0]?.rack || "—"}</td>
                  <td>{m.schedule === "NONE" ? "—" : m.schedule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        count={count}
        q={q}
        filters={{ filter: params.filter ?? "" }}
      />
    </>
  );
}
