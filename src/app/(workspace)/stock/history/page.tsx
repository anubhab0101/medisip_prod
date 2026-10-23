import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { pagination } from "@/lib/validation";
import {
  PageTitle,
  ListToolbar,
  Pagination,
  Empty,
} from "@/components/shared/page";
export default async function History({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.STOCK_READ);
  const params = await searchParams;
  const { q, page } = pagination.parse(params);
  const medicineId = params.medicine ?? "";
  const where = {
    branchId: ctx.branch.id,
    batch: {
      ...(medicineId ? { medicineId } : {}),
      medicine: { name: { contains: q } },
    },
  };
  const [rows, count] = await Promise.all([
    db().stockMovement.findMany({
      where,
      include: { batch: { include: { medicine: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().stockMovement.count({ where }),
  ]);
  return (
    <>
      <PageTitle
        title="Stock history"
        description="Every receipt, sale, return and adjustment."
        action={
          <Link className="button secondary" href="/stock">
            <T>{"Back to stock"}</T>
          </Link>
        }
      />
      <ListToolbar
        q={q}
        filters={{ medicine: medicineId }}
        placeholder="Search medicine"
      />
      {!rows.length ? (
        <Empty>
          <T>{"No stock movements found."}</T>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"When"}</T>
                </th>
                <th>
                  <T>{"Medicine / batch"}</T>
                </th>
                <th>
                  <T>{"Change"}</T>
                </th>
                <th>
                  <T>{"Reason"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.createdAt.toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td>
                    {row.batch.medicine.name}
                    <small>{row.batch.batchNo}</small>
                  </td>
                  <td>
                    {row.quantity > 0 ? "+" : ""}
                    {row.quantity}
                    <small>{row.type.replaceAll("_", " ")}</small>
                  </td>
                  <td>{row.reason}</td>
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
        filters={{ medicine: medicineId }}
      />
    </>
  );
}
