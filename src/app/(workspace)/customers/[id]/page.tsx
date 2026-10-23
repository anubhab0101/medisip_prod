import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { ReminderForm } from "@/features/notifications/reminder-form";
import { Permission, can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { shopDate } from "@/lib/date";
import { ActionForm } from "@/components/shared/action-form";
import { PageTitle, Empty } from "@/components/shared/page";
import {
  creditAction,
  consentAction,
} from "@/features/customers/profile-actions";
export default async function CustomerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await context(Permission.CUSTOMER);
  const { id } = await params;
  const customer = await db().customer.findFirst({
    where: { id, branchId: ctx.branch.id },
  });
  if (!customer) notFound();
  const [sales, entries, balance] = await Promise.all([
    db().sale.findMany({
      where: { customerId: id, branchId: ctx.branch.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { items: { select: { medicineId: true, name: true } } },
    }),
    db().creditEntry.findMany({
      where: { customerId: id, branchId: ctx.branch.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db().creditEntry.aggregate({
      where: { customerId: id, branchId: ctx.branch.id },
      _sum: { amountPaise: true },
    }),
  ]);
  const [points, pointEntries] = await Promise.all([
    db().loyaltyEntry.aggregate({
      where: { branchId: ctx.branch.id, customerId: id },
      _sum: { points: true },
    }),
    db().loyaltyEntry.findMany({
      where: { branchId: ctx.branch.id, customerId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const due = balance._sum.amountPaise ?? 0;
  const medicines = [
    ...new Map(
      sales
        .filter((s) => !["VOID", "RETURNED"].includes(s.status))
        .flatMap((s) => s.items)
        .map((i) => [i.medicineId, { id: i.medicineId, name: i.name }]),
    ).values(),
  ];
  return (
    <>
      <PageTitle
        title={customer.name}
        description={`${customer.phone}${customer.email ? ` · ${customer.email}` : ""}`}
        action={
          <Link href="/customers" className="button secondary">
            <T>{"Back"}</T>
          </Link>
        }
      />
      <section className="panel">
        <h2>
          <T>{"Outstanding credit: "}</T>
          {formatMoney(due)}
        </h2>
        {due > 0 && (
          <ActionForm action={creditAction} label="Record payment">
            <input type="hidden" name="customerId" value={id} />
            <input type="hidden" name="operationId" value={randomUUID()} />
            <div className="fields">
              <label>
                <T>{"Amount received (₹)"}</T>
                <input name="amount" inputMode="decimal" required />
              </label>
              <label>
                <T>{"Payment method"}</T>
                <select name="method">
                  <option value="CASH">
                    <T>{"Cash"}</T>
                  </option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">
                    <T>{"Card"}</T>
                  </option>
                </select>
              </label>
            </div>
          </ActionForm>
        )}
      </section>
      <details className="panel disclosure">
        <summary>
          <T>{"Message preferences"}</T>
        </summary>
        <ActionForm action={consentAction} label="Save preferences">
          <input type="hidden" name="customerId" value={id} />
          <p>
            <T>{"Update these only with the customer’s permission."}</T>
          </p>
          <div className="inline">
            <label className="checkbox">
              <input
                name="consentSms"
                type="checkbox"
                defaultChecked={customer.consentSms}
              />
              SMS
            </label>
            <label className="checkbox">
              <input
                name="consentWhatsapp"
                type="checkbox"
                defaultChecked={customer.consentWhatsapp}
              />
              WhatsApp
            </label>
            <label className="checkbox">
              <input
                name="consentEmail"
                type="checkbox"
                defaultChecked={customer.consentEmail}
              />
              <T>{"Email"}</T>
            </label>
          </div>
        </ActionForm>
      </details>
      {can(ctx.role, Permission.MESSAGES) && (
        <ReminderForm customerId={id} medicines={medicines} />
      )}
      <section className="panel">
        <h2>
          <T>{"Recent bills"}</T>
        </h2>
        {!sales.length ? (
          <Empty>
            <T>{"No bills yet."}</T>
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
                    <T>{"Date"}</T>
                  </th>
                  <th>
                    <T>{"Total"}</T>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link className="text-link" href={`/bills/${s.id}`}>
                        {s.invoiceNo}
                      </Link>
                    </td>
                    <td>{shopDate(s.createdAt)}</td>
                    <td>{formatMoney(s.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {(ctx.branch.loyaltyEnabled || pointEntries.length > 0) && (
        <section className="panel">
          <h2>
            <T>{"Loyalty points: "}</T>
            {points._sum.points ?? 0}
          </h2>
          {pointEntries.map((e) => (
            <p key={e.id}>
              {shopDate(e.createdAt)} · {e.reason} · {e.points > 0 ? "+" : ""}
              {e.points}
            </p>
          ))}
        </section>
      )}
      <section className="panel">
        <h2>
          <T>{"Credit history"}</T>
        </h2>
        {!entries.length ? (
          <p>
            <T>{"No credit entries."}</T>
          </p>
        ) : (
          entries.map((e) => (
            <p key={e.id}>
              {shopDate(e.createdAt)} · {e.reason} ·{" "}
              <strong>{formatMoney(e.amountPaise)}</strong>
            </p>
          ))
        )}
      </section>
    </>
  );
}
