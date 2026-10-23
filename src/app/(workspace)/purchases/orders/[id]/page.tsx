import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { shopDate } from "@/lib/date";
import { ActionForm } from "@/components/shared/action-form";
import { PageTitle } from "@/components/shared/page";
import { PrintButton } from "@/components/shared/print-button";
import { orderAction } from "@/features/orders/actions";
import { orderItems } from "@/features/orders/service";
import { PurchaseForm } from "@/features/stock/purchase-form";
export default async function Order({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await context(Permission.STOCK_WRITE);
  const { id } = await params;
  const order = await db().purchaseOrder.findFirst({
    where: { id, branchId: ctx.branch.id },
  });
  if (!order) notFound();
  const supplier = await db().supplier.findUnique({
    where: { id: order.supplierId },
  });
  const items = orderItems.parse(order.items);
  return (
    <>
      <PageTitle
        title={`Order ${id.slice(0, 8)}`}
        description={`${supplier?.name} - ${order.status}`}
        action={
          <Link href="/purchases/orders" className="button secondary">
            <T>{"Back"}</T>
          </Link>
        }
      />
      {order.status === "DRAFT" ? (
        <ActionForm action={orderAction} label="Confirm order">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="ORDERED" />
          {items.map((i) => (
            <label key={i.medicineId}>
              {i.name}
              <input type="hidden" name="medicineId" value={i.medicineId} />
              <input type="hidden" name="name" value={i.name} />
              <input
                type="number"
                name="quantity"
                min="1"
                max="1000000"
                defaultValue={i.quantity}
                required
              />
            </label>
          ))}
          <label className="checkbox">
            <input type="checkbox" name="confirmed" required />
            <T>
              {
                "I checked the supplier and quantities. I will place the order myself."
              }
            </T>
          </label>
        </ActionForm>
      ) : (
        <section className="panel">
          {items.map((i) => (
            <p key={i.medicineId}>
              {i.name}: <strong>{i.quantity}</strong>
            </p>
          ))}
          <PrintButton />
        </section>
      )}
      {order.status === "ORDERED" && supplier?.active && (
        <details className="panel disclosure">
          <summary>
            <T>{"Receive this order"}</T>
          </summary>
          <p>
            <T>
              {
                "Record all ordered quantities. Stock is added only when this purchase is saved."
              }
            </T>
          </p>
          <PurchaseForm
            suppliers={[supplier]}
            medicines={items.map((i) => ({ id: i.medicineId, name: i.name }))}
            date={shopDate()}
            operationId={randomUUID()}
            orderId={id}
            initialItems={items}
          />
        </details>
      )}
      {["DRAFT", "ORDERED"].includes(order.status) && (
        <details className="panel disclosure">
          <summary>
            <T>{"Cancel order"}</T>
          </summary>
          <ActionForm action={orderAction} label="Cancel order">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value="CANCELLED" />
            <label className="checkbox">
              <input type="checkbox" name="confirmed" required />
              <T>{"Cancel this order without changing stock."}</T>
            </label>
          </ActionForm>
        </details>
      )}
    </>
  );
}
