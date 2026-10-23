import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission, can } from "@/lib/permissions";
import { pagination } from "@/lib/validation";
import { shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { ActionForm } from "@/components/shared/action-form";
import {
  PageTitle,
  ListToolbar,
  Pagination,
  Empty,
} from "@/components/shared/page";
import { adjustmentAction } from "@/features/stock/actions";
import Link from "next/link";
export default async function Stock({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.STOCK_READ);
  const params = await searchParams;
  const { q, page } = pagination.parse(params);
  const today = new Date(shopDate());
  const soon = new Date(today.getTime() + 30 * 86400000);
  const where = {
    branchId: ctx.branch.id,
    medicine: { name: { contains: q } },
    ...(params.filter === "expired"
      ? { expiryDate: { lt: today }, qtyOnHand: { gt: 0 } }
      : params.filter === "expiring"
        ? { expiryDate: { gte: today, lte: soon }, qtyOnHand: { gt: 0 } }
        : {}),
  };
  const [items, count] = await Promise.all([
    db().batch.findMany({
      where,
      include: { medicine: true },
      orderBy: { expiryDate: "asc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().batch.count({ where }),
  ]);
  return (
    <>
      <p>
        <Link className="text-link" href="/stock/transfers">
          <T>{"Branch transfers"}</T>
        </Link>
      </p>
      <PageTitle
        title="Stock"
        description="Track batches, expiry and available quantities."
        action={
          can(ctx.role, Permission.STOCK_WRITE) && (
            <Link href="/purchases" className="button">
              <T>{"+ Add stock"}</T>
            </Link>
          )
        }
      />
      <nav className="tabs">
        <Link href="/stock">
          <T>{"All"}</T>
        </Link>
        <Link href="/stock/low">
          <T>{"Low stock"}</T>
        </Link>
        <Link href="/stock?filter=expiring">
          <T>{"Expiring soon"}</T>
        </Link>
        <Link href="/stock?filter=expired">
          <T>{"Expired"}</T>
        </Link>
        <Link href="/stock/history">
          <T>{"History"}</T>
        </Link>
      </nav>
      <ListToolbar
        q={q}
        placeholder="Search medicine"
        filters={{ filter: params.filter ?? "" }}
      />
      {!items.length ? (
        <Empty>
          <T>{"No batches found. Add stock from a supplier purchase."}</T>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Medicine / batch"}</T>
                </th>
                <th>
                  <T>{"Expiry"}</T>
                </th>
                <th>
                  <T>{"Available"}</T>
                </th>
                <th>
                  <T>{"Reserved"}</T>
                </th>
                <th>MRP</th>
                <th>
                  <T>{"Action"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link
                      className="text-link"
                      href={`/stock/history?medicine=${b.medicineId}`}
                    >
                      {b.medicine.name}
                    </Link>
                    <small>{b.batchNo}</small>
                  </td>
                  <td>
                    <span
                      className={b.expiryDate < today ? "chip danger" : "chip"}
                    >
                      {b.expiryDate.toISOString().slice(0, 7)}
                    </span>
                  </td>
                  <td>{b.qtyOnHand - b.qtyReserved}</td>
                  <td>{b.qtyReserved}</td>
                  <td>{formatMoney(b.mrpPaise)}</td>
                  <td>
                    {can(ctx.role, Permission.STOCK_WRITE) && (
                      <details>
                        <summary>
                          <T>{"Adjust"}</T>
                        </summary>
                        <Link className="text-link" href={`/stock/${b.id}`}>
                          <T>{"Edit batch details / prices"}</T>
                        </Link>
                        <ActionForm
                          action={adjustmentAction}
                          label="Save adjustment"
                        >
                          <input type="hidden" name="batchId" value={b.id} />
                          <input
                            type="hidden"
                            name="operationId"
                            value={randomUUID()}
                          />
                          <label>
                            <T>{"Quantity change"}</T>
                            <LocalizedInput
                              name="quantity"
                              type="number"
                              required
                              placeholder="−2 or 2"
                            />
                            <small>
                              <T>{"Use a negative number to remove stock."}</T>
                            </small>
                          </label>
                          <label>
                            <T>{"Reason"}</T>
                            <input name="reason" required minLength={3} />
                          </label>
                          <label>
                            <T>{"Adjustment type"}</T>
                            <select name="type" defaultValue="ADJUST">
                              <option value="ADJUST">
                                <T>{"Correction / damage"}</T>
                              </option>
                              <option value="EXPIRED">
                                <T>{"Expired stock write-off"}</T>
                              </option>
                            </select>
                          </label>
                          <label className="checkbox">
                            <input type="checkbox" required />
                            <T>{"I checked the quantity change."}</T>
                          </label>
                        </ActionForm>
                      </details>
                    )}
                  </td>
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
