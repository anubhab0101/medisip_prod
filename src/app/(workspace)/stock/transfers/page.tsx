import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { shopDate } from "@/lib/date";
import { PageTitle } from "@/components/shared/page";
import { ActionForm } from "@/components/shared/action-form";
import {
  dispatchAction,
  receiveTransferAction,
} from "@/features/transfers/actions";
import { transferItems } from "@/features/transfers/service";
export default async function Transfers() {
  const ctx = await context(Permission.STOCK_WRITE);
  const destinations = ctx.memberships.filter(
    (m) =>
      m.branchId !== ctx.branch.id &&
      m.branch.demo === ctx.branch.demo &&
      ["OWNER", "PHARMACIST"].includes(m.role),
  );
  const [batches, transfers] = await Promise.all([
    db().batch.findMany({
      where: {
        branchId: ctx.branch.id,
        qtyOnHand: { gt: 0 },
        expiryDate: { gte: new Date(shopDate()) },
      },
      include: { medicine: true },
      orderBy: { expiryDate: "asc" },
      take: 1000,
    }),
    db().transfer.findMany({
      where: {
        OR: [{ fromBranchId: ctx.branch.id }, { toBranchId: ctx.branch.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return (
    <>
      <PageTitle
        title="Branch transfers"
        description="Dispatch from this shop; confirm arrival in the receiving shop."
        action={
          <Link href="/stock" className="button secondary">
            <T>{"Stock"}</T>
          </Link>
        }
      />
      <details className="panel disclosure">
        <summary>
          <T>{"+ Send stock"}</T>
        </summary>
        {!destinations.length ? (
          <p>
            <T>{"Add another shop you manage to transfer stock."}</T>
          </p>
        ) : (
          <ActionForm action={dispatchAction} label="Dispatch stock">
            <input type="hidden" name="operationId" value={randomUUID()} />
            <div className="fields">
              <label>
                <T>{"Receiving shop"}</T>
                <select name="toBranchId">
                  {destinations.map((m) => (
                    <option key={m.branchId} value={m.branchId}>
                      {m.branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <T>{"Batch"}</T>
                <select name="batchId">
                  {batches
                    .filter((b) => b.qtyOnHand > b.qtyReserved)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.medicine.name} / {b.batchNo} /{" "}
                        {b.qtyOnHand - b.qtyReserved}
                        <T>{" available"}</T>
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <T>{"Quantity"}</T>
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  max="1000000"
                  required
                />
              </label>
            </div>
            <label className="checkbox">
              <input name="confirmed" type="checkbox" required />
              <T>
                {
                  "These units are leaving this shop. Remove them from available stock."
                }
              </T>
            </label>
          </ActionForm>
        )}
      </details>
      {transfers.map((t) => (
        <section className="panel" key={t.id}>
          <h2>
            <T>{t.fromBranchId === ctx.branch.id ? "Outgoing" : "Incoming"}</T>{" "}
            - {t.status}
          </h2>
          {transferItems.parse(t.items).map((i) => (
            <p key={i.batchId}>
              {i.name} / {i.batchNo}: <strong>{i.quantity}</strong>
            </p>
          ))}
          <small>
            {t.id} · {shopDate(t.createdAt)}
          </small>
          {t.toBranchId === ctx.branch.id && t.status === "DISPATCHED" && (
            <ActionForm action={receiveTransferAction} label="Confirm receipt">
              <input type="hidden" name="id" value={t.id} />
              <label className="checkbox">
                <input name="confirmed" type="checkbox" required />
                <T>{"I counted and received all these units."}</T>
              </label>
            </ActionForm>
          )}
        </section>
      ))}
    </>
  );
}
