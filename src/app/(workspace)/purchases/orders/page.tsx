import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { ActionForm } from "@/components/shared/action-form";
import { PageTitle } from "@/components/shared/page";
import { draftOrderAction } from "@/features/orders/actions";
export default async function Orders() {
  const ctx = await context(Permission.STOCK_WRITE);
  const [suppliers, orders] = await Promise.all([
    db().supplier.findMany({
      where: { branchId: ctx.branch.id, active: true },
      orderBy: { name: "asc" },
    }),
    db().purchaseOrder.findMany({
      where: { branchId: ctx.branch.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return (
    <>
      <PageTitle
        title="Purchase orders"
        description="Create a suggested order from low stock, review it, then record received stock."
        action={
          <Link href="/purchases" className="button secondary">
            <T>{"Purchases"}</T>
          </Link>
        }
      />
      <details className="panel disclosure">
        <summary>
          <T>{"+ Suggested order"}</T>
        </summary>
        <p>
          <T>
            {
              "Up to 100 low-stock medicines, targeting twice the alert level. Review the supplier and quantities before ordering."
            }
          </T>
        </p>
        <ActionForm action={draftOrderAction} label="Create draft">
          <input type="hidden" name="operationId" value={randomUUID()} />
          <label>
            <T>{"Supplier"}</T>
            <select name="supplierId" required>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </ActionForm>
      </details>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <T>{"Order"}</T>
              </th>
              <th>
                <T>{"Supplier"}</T>
              </th>
              <th>
                <T>{"Status"}</T>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link
                    className="text-link"
                    href={`/purchases/orders/${o.id}`}
                  >
                    {o.id.slice(0, 8)}
                  </Link>
                </td>
                <td>
                  {suppliers.find((s) => s.id === o.supplierId)?.name ??
                    "Archived supplier"}
                </td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
