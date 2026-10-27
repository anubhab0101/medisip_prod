import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission, can } from "@/lib/permissions";
import { dayStart, shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { PageTitle } from "@/components/shared/page";

export default async function Dashboard() {
  const ctx = await context();
  if (ctx.role === "DOCTOR") redirect("/appointments");
  const branchId = ctx.branch.id;
  const todayStart = dayStart();
  const tomorrow = new Date(todayStart.getTime() + 86400000);
  const today = shopDate();
  const expiryCutoff = new Date(`${today}T00:00:00+05:30`);
  expiryCutoff.setDate(expiryCutoff.getDate() + 30);

  const [sales, payments, medicineCount, batchSummary, attention, daily, lowStock, appointments] =
    await Promise.all([
      db().sale.aggregate({
        where: {
          branchId,
          createdAt: { gte: todayStart, lt: tomorrow },
          status: { not: "VOID" },
        },
        _sum: { totalPaise: true },
        _count: true,
      }),
      db().payment.groupBy({
        by: ["method"],
        where: {
          sale: {
            branchId,
            createdAt: { gte: todayStart, lt: tomorrow },
            status: { not: "VOID" },
          },
        },
        _sum: { amountPaise: true },
      }),
      db().branchMedicine.count({ where: { branchId, active: true } }),
      db().$queryRaw<{ total: bigint; expiring: bigint }[]>`
        SELECT COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN qtyOnHand > 0 AND expiryDate >= ${new Date(today)} AND expiryDate <= ${expiryCutoff} THEN 1 ELSE 0 END), 0) AS expiring
        FROM Batch WHERE branchId=${branchId}
      `,
      db().batch.findMany({
        where: { branchId, qtyOnHand: { gt: 0 }, expiryDate: { lte: expiryCutoff } },
        select: {
          id: true,
          batchNo: true,
          qtyOnHand: true,
          expiryDate: true,
          medicine: { select: { name: true } },
        },
        orderBy: { expiryDate: "asc" },
        take: 4,
      }),
      ctx.role === "OWNER"
        ? db().auditLog.findFirst({
            where: { branchId, action: "DAILY_STOCK_SCAN" },
            orderBy: { createdAt: "desc" },
            select: { after: true },
          })
        : Promise.resolve(null),
      db().$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM (
          SELECT bm.medicineId
          FROM BranchMedicine bm
          JOIN Medicine m ON m.id=bm.medicineId
          LEFT JOIN Batch b ON b.medicineId=m.id AND b.branchId=bm.branchId AND b.expiryDate >= ${new Date(today)}
          WHERE bm.branchId=${branchId} AND bm.active=1 AND m.active=1
          GROUP BY bm.medicineId,bm.reorderLevel
          HAVING COALESCE(SUM(b.qtyOnHand-b.qtyReserved),0) <= bm.reorderLevel
        ) lowStock` ,
      can(ctx.role, Permission.APPOINTMENT)
        ? db().appointment.findMany({
            where: {
              branchId,
              startsAt: { gte: todayStart, lt: tomorrow },
              status: { not: "CANCELLED" },
            },
            include: { doctor: { select: { name: true } } },
            orderBy: { startsAt: "asc" },
            take: 3,
          })
        : Promise.resolve([]),
    ]);

  const summary = z
    .object({
      date: z.string(),
      expired: z.number(),
      expiring: z.number(),
      lowStock: z.number(),
    })
    .safeParse(daily?.after);
  const expiringCount = Number(batchSummary[0]?.expiring ?? 0);
  const totalFor = (method: string) =>
    payments.find((payment) => payment.method === method)?._sum.amountPaise ?? 0;

  const setupSteps = [
    ...(can(ctx.role, Permission.SETTINGS)
      ? [{ href: "/settings/setup", label: "Set up your shop step by step" }]
      : []),
    ...(!ctx.branch.drugLicenseNo && can(ctx.role, Permission.SETTINGS)
      ? [{ href: "/settings", label: "Finish shop details" }]
      : []),
    ...(!medicineCount && can(ctx.role, Permission.MEDICINE_WRITE)
      ? [{ href: "/medicines", label: "Add your first medicine" }]
      : []),
    ...(!Number(batchSummary[0]?.total ?? 0) && can(ctx.role, Permission.STOCK_WRITE)
      ? [{ href: "/purchases", label: "Add opening stock" }]
      : []),
  ];

  return (
    <>
      <PageTitle
        title="Today"
        description={`${new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(todayStart)} · ${ctx.branch.name}`}
        action={
          can(ctx.role, Permission.BILL) && (
            <Link className="button" href="/billing">
              <T>{"New bill"}</T>
            </Link>
          )
        }
      />

      <div className="dashboard-stats">
        <article className="stat-card">
          <span><T>{"Sales today"}</T></span>
          <strong>{formatMoney(sales._sum.totalPaise ?? 0)}</strong>
          <small><T values={{ count: sales._count }}>{"{count} bills"}</T></small>
        </article>
        <article className="stat-card payment-stat-card">
          <span><T>{"Cash · UPI · Card"}</T></span>
          <div className="payment-summary">
            <strong>{formatMoney(totalFor("CASH"))}</strong>
            <strong>{formatMoney(totalFor("UPI"))}</strong>
            <strong>{formatMoney(totalFor("CARD"))}</strong>
          </div>
          <small><T>{"Credit sales "}</T>{formatMoney(totalFor("CREDIT"))}</small>
        </article>
        <article className="stat-card">
          <span><T>{"Low stock"}</T></span>
          <strong><T values={{ count: Number(lowStock[0]?.total ?? 0) }}>{"{count} medicines"}</T></strong>
          <Link className="text-link" href={can(ctx.role, Permission.STOCK_WRITE) ? "/purchases/orders" : "/stock/low"}>
            <T>{can(ctx.role, Permission.STOCK_WRITE) ? "Make order" : "Review"}</T>
          </Link>
        </article>
        <article className="stat-card">
          <span><T>{"Expiring in 30 days"}</T></span>
          <strong><T values={{ count: expiringCount }}>{"{count} batches"}</T></strong>
          <Link className="text-link" href="/stock?filter=expiring"><T>{"Review"}</T></Link>
        </article>
      </div>

      <div className="dashboard-panels">
        <section className="panel dashboard-attention">
          <h2><T>{"Needs attention"}</T></h2>
          {attention.length ? (
            <div className="dashboard-table-wrap">
              <table>
                <thead><tr>
                  <th><T>{"Medicine"}</T></th>
                  <th><T>{"Batch"}</T></th>
                  <th><T>{"Status"}</T></th>
                  <th><span className="sr-only"><T>{"Action"}</T></span></th>
                </tr></thead>
                <tbody>{attention.map((batch) => {
                  const expired = batch.expiryDate.toISOString().slice(0, 10) < today;
                  const canEdit = can(ctx.role, Permission.STOCK_WRITE);
                  return (
                    <tr key={batch.id}>
                      <td data-label="Medicine">{batch.medicine.name}</td>
                      <td data-label="Batch">{batch.batchNo}</td>
                      <td data-label="Status">
                        <span className={expired ? "chip danger" : "chip warning"}>
                          {expired ? <T>{"Expired · not for sale"}</T> : <T>{"Expires within 30 days"}</T>}
                        </span>
                      </td>
                      <td data-label="Action">
                        <Link className="button secondary" href={canEdit ? `/stock/${batch.id}` : expired ? "/stock?filter=expired" : "/stock?filter=expiring"}>
                          <T>{expired ? "View batch" : "Review"}</T>
                        </Link>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : (
            <div className="empty compact-empty"><T>{"No batches need attention today."}</T></div>
          )}
        </section>

        {can(ctx.role, Permission.APPOINTMENT) && (
          <section className="panel dashboard-appointments">
            <h2><T>{"Appointments today"}</T></h2>
            {appointments.length ? (
              <ul className="appointment-summary-list">
                {appointments.map((appointment) => (
                  <li key={appointment.id}>
                    <span className="appointment-time">{new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit",
                    }).format(appointment.startsAt)}</span>
                    <span className="appointment-doctor">{appointment.doctor.name}</span>
                    <span className={`chip appointment-status status-${appointment.status.toLowerCase()}`}>
                      <T>{appointment.status === "NO_SHOW" ? "No show" : appointment.status[0] + appointment.status.slice(1).toLowerCase()}</T>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty compact-empty"><T>{"No appointments today."}</T></div>
            )}
            <Link className="button secondary appointment-open" href="/appointments"><T>{"Open appointments"}</T></Link>
          </section>
        )}
      </div>

      {setupSteps.length > 0 && (
        <section className="panel dashboard-setup">
          <h2><T>{"Getting started"}</T></h2>
          <div className="task-list">
            {setupSteps.map((step) => <Link key={step.href} href={step.href}><T>{step.label}</T><span>→</span></Link>)}
          </div>
        </section>
      )}

      <nav className="dashboard-quick-actions" aria-label="Quick actions">
        {can(ctx.role, Permission.STOCK_WRITE) && <Link className="button secondary" href="/purchases"><T>{"Receive stock"}</T></Link>}
        {can(ctx.role, Permission.MEDICINE_WRITE) && <Link className="button secondary" href="/medicines"><T>{"Add medicine"}</T></Link>}
        {can(ctx.role, Permission.APPOINTMENT) && <Link className="button secondary" href="/appointments"><T>{"Book appointment"}</T></Link>}
        {can(ctx.role, Permission.MESSAGES) && <Link className="button secondary" href="/notifications"><T>{"Send message"}</T></Link>}
      </nav>

      {summary.success && (
        <details className="panel disclosure dashboard-stock-summary">
          <summary><T>{"Daily stock check · "}</T>{summary.data.date}</summary>
          <div className="stack">
            <p>
              <T>{"This saved morning check found "}</T>{summary.data.expired}
              <T>{" expired batches, "}</T>{summary.data.expiring}
              <T>{" batches expiring within 30 days and "}</T>{summary.data.lowStock}
              <T>{" medicines at or below their stock alert level."}</T>
            </p>
            <div className="inline">
              <Link className="text-link" href="/stock/low"><T>{"Review current low stock"}</T></Link>
              <Link className="text-link" href="/stock?filter=expired"><T>{"Review expired stock"}</T></Link>
            </div>
          </div>
        </details>
      )}
    </>
  );
}
