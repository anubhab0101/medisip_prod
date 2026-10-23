import { T } from "@/lib/i18n/provider";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission, can } from "@/lib/permissions";
import { dayStart, shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { PageTitle } from "@/components/shared/page";
import { z } from "zod";
export default async function Dashboard() {
  const ctx = await context();
  if (ctx.role === "DOCTOR") redirect("/appointments");
  const branchId = ctx.branch.id;
  const [sales, medicineCount, batches, customers, daily] = await Promise.all([
    db().sale.aggregate({
      where: {
        branchId,
        createdAt: { gte: dayStart() },
        status: { not: "VOID" },
      },
      _sum: { totalPaise: true },
      _count: true,
    }),
    db().branchMedicine.count({ where: { branchId } }),
    db().batch.findMany({
      where: { branchId },
      select: { qtyOnHand: true, expiryDate: true },
    }),
    db().customer.count({ where: { branchId, active: true } }),
    ctx.role === "OWNER"
      ? db().auditLog.findFirst({
          where: { branchId, action: "DAILY_STOCK_SCAN" },
          orderBy: { createdAt: "desc" },
          select: { after: true },
        })
      : Promise.resolve(null),
  ]);
  const summary = z
    .object({
      date: z.string(),
      expired: z.number(),
      expiring: z.number(),
      lowStock: z.number(),
    })
    .safeParse(daily?.after);
  const expiryCutoff = new Date();
  expiryCutoff.setDate(expiryCutoff.getDate() + 30);
  const expired = batches.filter(
    (b) =>
      b.qtyOnHand > 0 && b.expiryDate.toISOString().slice(0, 10) < shopDate(),
  ).length;
  const expiring = batches.filter(
    (b) =>
      b.qtyOnHand > 0 &&
      b.expiryDate >= new Date(shopDate()) &&
      b.expiryDate <= expiryCutoff,
  ).length;
  return (
    <>
      <PageTitle
        title="Today"
        description="Your pharmacy at a glance."
        action={
          can(ctx.role, Permission.BILL) && (
            <Link className="button" href="/billing">
              <T>{"+ New bill"}</T>
            </Link>
          )
        }
      />
      <div className="stats">
        <div>
          <span>
            <T>{"Sales today"}</T>
          </span>
          <strong>{formatMoney(sales._sum.totalPaise ?? 0)}</strong>
        </div>
        <div>
          <span>
            <T>{"Bills today"}</T>
          </span>
          <strong>{sales._count}</strong>
        </div>
        <div>
          <span>
            <T>{"Medicines"}</T>
          </span>
          <strong>{medicineCount}</strong>
        </div>
        <div>
          <span>
            <T>{"Customers"}</T>
          </span>
          <strong>{customers}</strong>
        </div>
      </div>
      <section className="panel">
        <h2>
          <T>{"Next steps"}</T>
        </h2>
        <div className="task-list">
          {can(ctx.role, Permission.SETTINGS) && (
            <Link href="/settings/setup">
              <T>{"Set up your shop step by step "}</T>
              <span>→</span>
            </Link>
          )}
          {!ctx.branch.drugLicenseNo && can(ctx.role, Permission.SETTINGS) && (
            <Link href="/settings">
              <T>{"Finish shop details "}</T>
              <span>→</span>
            </Link>
          )}
          {!medicineCount && can(ctx.role, Permission.MEDICINE_WRITE) && (
            <Link href="/medicines">
              <T>{"Add your first medicine "}</T>
              <span>→</span>
            </Link>
          )}
          {!batches.length && can(ctx.role, Permission.STOCK_WRITE) && (
            <Link href="/purchases">
              <T>{"Add opening stock "}</T>
              <span>→</span>
            </Link>
          )}
          {expired > 0 && (
            <Link href="/stock?filter=expired">
              <T>{"Review "}</T>
              {expired}
              <T>{" expired batches "}</T>
              <span>→</span>
            </Link>
          )}
          {expiring > 0 && (
            <Link href="/stock?filter=expiring">
              <T>{"Review "}</T>
              {expiring}
              <T>{" batches expiring soon "}</T>
              <span>→</span>
            </Link>
          )}
          {medicineCount > 0 && batches.length > 0 && !expired && !expiring && (
            <p>
              <T>{"No expiry alerts today."}</T>
            </p>
          )}
        </div>
      </section>
      {summary.success && (
        <section className="panel">
          <h2>
            <T>{"Daily stock check · "}</T>
            {summary.data.date}
          </h2>
          <p>
            <T>{"This saved morning check found "}</T>
            {summary.data.expired}
            <T>{" expired batches, "}</T>
            {summary.data.expiring}
            <T>{" batches expiring within 30 days and"}</T>{" "}
            {summary.data.lowStock}
            <T>{" medicines at or below their stock alert level."}</T>
          </p>
          <Link className="text-link" href="/stock/low">
            <T>{"Review current low stock"}</T>
          </Link>
          {" · "}
          <Link className="text-link" href="/stock?filter=expired">
            <T>{"Review expired stock"}</T>
          </Link>
        </section>
      )}
    </>
  );
}
