import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { pagination } from "@/lib/validation";
import { shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { PageTitle, Pagination, Empty } from "@/components/shared/page";
export default async function Bills({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.BILL);
  const params = await searchParams;
  const { q, page } = pagination.parse(params);
  const validDate = (s: string | undefined) =>
    s &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(new Date(`${s}T00:00:00+05:30`).getTime()) &&
    shopDate(new Date(`${s}T00:00:00+05:30`)) === s
      ? s
      : "";
  const from = validDate(params.from),
    to = validDate(params.to);
  const where = {
    branchId: ctx.branch.id,
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00+05:30`) } : {}),
            ...(to
              ? {
                  lt: new Date(
                    new Date(`${to}T00:00:00+05:30`).getTime() + 86400000,
                  ),
                }
              : {}),
          },
        }
      : {}),
    OR: [
      { invoiceNo: { contains: q } },
      { customer: { name: { contains: q } } },
    ],
  };
  const [items, count] = await Promise.all([
    db().sale.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().sale.count({ where }),
  ]);
  return (
    <>
      <PageTitle
        title="Bills"
        action={
          <Link className="button" href="/billing">
            <T>{"+ New bill"}</T>
          </Link>
        }
      />
      <form className="toolbar">
        <label>
          <T>{"Search"}</T>
          <LocalizedInput
            name="q"
            defaultValue={q}
            placeholder="Invoice or customer"
          />
        </label>
        <label>
          <T>{"From"}</T>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          <T>{"To"}</T>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button className="button secondary">
          <T>{"Search"}</T>
        </button>
      </form>
      <Link className="text-link" href="/deliveries">
        <T>{"Track home deliveries"}</T>
      </Link>
      {!items.length ? (
        <Empty>
          <T>{"No bills found."}</T>
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
                  <T>{"Customer"}</T>
                </th>
                <th>
                  <T>{"Date"}</T>
                </th>
                <th>
                  <T>{"Status"}</T>
                </th>
                <th>
                  <T>{"Total"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link className="text-link" href={`/bills/${s.id}`}>
                      {s.invoiceNo}
                    </Link>
                  </td>
                  <td>{s.customer?.name ?? "Walk-in"}</td>
                  <td>{shopDate(s.createdAt)}</td>
                  <td>{s.status}</td>
                  <td>{formatMoney(s.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} count={count} q={q} filters={{ from, to }} />
    </>
  );
}
