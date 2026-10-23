import { T } from "@/lib/i18n/provider";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { pagination } from "@/lib/validation";
import { ActionForm } from "@/components/shared/action-form";
import {
  PageTitle,
  ListToolbar,
  Pagination,
  Empty,
} from "@/components/shared/page";
import { PurchaseForm } from "@/features/stock/purchase-form";
import { supplierAction } from "@/features/suppliers/actions";
export default async function Purchases({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.STOCK_WRITE);
  const { q, page } = pagination.parse(await searchParams);
  const branchId = ctx.branch.id;
  const where = { branchId, invoiceNo: { contains: q } };
  const [suppliers, medicines, items, count] = await Promise.all([
    db().supplier.findMany({
      where: { branchId, active: true },
      orderBy: { name: "asc" },
    }),
    db().medicine.findMany({
      where: {
        active: true,
        branchSettings: { some: { branchId, active: true } },
      },
      orderBy: { name: "asc" },
    }),
    db().purchase.findMany({
      where,
      include: { supplier: true },
      orderBy: { date: "desc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().purchase.count({ where }),
  ]);
  return (
    <>
      <PageTitle
        title="Purchases"
        description="Record a supplier bill to add stock."
        action={
          <Link href="/suppliers" className="button secondary">
            <T>{"Manage suppliers"}</T>
          </Link>
        }
      />
      <p>
        <Link className="text-link" href="/purchases/orders">
          <T>{"Purchase orders from low stock"}</T>
        </Link>
      </p>
      <details className="panel disclosure">
        <summary>
          <T>{"+ Add supplier"}</T>
        </summary>
        <ActionForm action={supplierAction} label="Add supplier">
          <div className="fields">
            <label>
              <T>{"Name"}</T>
              <input name="name" required />
            </label>
            <label>
              <T>{"Phone"}</T>
              <input name="phone" />
            </label>
            <label>
              GSTIN
              <input name="gstin" />
            </label>
          </div>
        </ActionForm>
      </details>
      <details className="panel disclosure">
        <summary>
          <T>{"+ Add purchase"}</T>
        </summary>
        {!suppliers.length || !medicines.length ? (
          <Empty>
            <T>{"Add a supplier and at least one medicine first."}</T>
          </Empty>
        ) : (
          <PurchaseForm
            suppliers={suppliers}
            medicines={medicines}
            date={shopDate()}
            operationId={randomUUID()}
          />
        )}
      </details>
      <ListToolbar q={q} placeholder="Supplier invoice number" />
      {!items.length ? (
        <Empty>
          <T>{"No purchases yet."}</T>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Invoice"}</T>
                </th>
                <th>
                  <T>{"Supplier"}</T>
                </th>
                <th>
                  <T>{"Date"}</T>
                </th>
                <th>
                  <T>{"Total"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{p.invoiceNo}</td>
                  <td>{p.supplier.name}</td>
                  <td>{shopDate(p.date)}</td>
                  <td>{formatMoney(p.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} count={count} q={q} />
    </>
  );
}
