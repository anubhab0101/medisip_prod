import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { shopDate } from "@/lib/date";
import { pagination } from "@/lib/validation";
import {
  PageTitle,
  ListToolbar,
  Pagination,
  Empty,
} from "@/components/shared/page";
export default async function LowStock({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.STOCK_READ);
  const { q, page } = pagination.parse(await searchParams);
  const query = Prisma.sql`SELECT m.id, m.name, bm.reorderLevel, COALESCE(SUM(b.qtyOnHand-b.qtyReserved),0) AS available
    FROM BranchMedicine bm JOIN Medicine m ON m.id=bm.medicineId
    LEFT JOIN Batch b ON b.medicineId=m.id AND b.branchId=bm.branchId AND b.expiryDate >= ${new Date(shopDate())}
    WHERE bm.branchId=${ctx.branch.id} AND bm.active=1 AND m.active=1 AND m.name LIKE ${`%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`}
    GROUP BY m.id,m.name,bm.reorderLevel HAVING available <= bm.reorderLevel`;
  const [rows, counts] = await Promise.all([
    db().$queryRaw<
      {
        id: string;
        name: string;
        reorderLevel: number;
        available: Prisma.Decimal;
      }[]
    >(
      Prisma.sql`${query} ORDER BY available,m.name LIMIT 20 OFFSET ${(page - 1) * 20}`,
    ),
    db().$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM (${query}) lowStock`,
    ),
  ]);
  return (
    <>
      <PageTitle
        title="Low stock"
        description="Available, unexpired units at or below your alert level."
        action={
          <Link className="button secondary" href="/stock">
            <T>{"Back to stock"}</T>
          </Link>
        }
      />
      <ListToolbar q={q} />
      {!rows.length ? (
        <Empty>
          <T>{"No medicines need restocking."}</T>
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
                  <T>{"Available"}</T>
                </th>
                <th>
                  <T>{"Alert level"}</T>
                </th>
                <th>
                  <T>{"Action"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{Number(row.available)}</td>
                  <td>{row.reorderLevel}</td>
                  <td>
                    <Link className="text-link" href="/purchases">
                      <T>{"Add stock"}</T>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} count={Number(counts[0]?.total ?? 0)} q={q} />
    </>
  );
}
