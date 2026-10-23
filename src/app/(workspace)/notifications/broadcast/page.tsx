import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import {
  PageTitle,
  Empty,
  Pagination,
  ListToolbar,
} from "@/components/shared/page";
import { pagination } from "@/lib/validation";
import { BroadcastForm } from "@/features/notifications/broadcast-form";
export default async function Broadcasts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.MESSAGES);
  const { q, page } = pagination.parse(await searchParams);
  const where = { branchId: ctx.branch.id, title: { contains: q } };
  const [customers, doctors, broadcasts, count] = await Promise.all([
    db().customer.findMany({
      where: { branchId: ctx.branch.id, active: true },
      select: { id: true, name: true, phone: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    db().doctor.findMany({
      where: { branchId: ctx.branch.id, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db().broadcast.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().broadcast.count({ where }),
  ]);
  return (
    <>
      <PageTitle
        title="Broadcast"
        description="Tell customers about a doctor’s visit, booking times or a shop update."
        action={
          <Link className="button secondary" href="/notifications">
            <T>{"Messages"}</T>
          </Link>
        }
      />
      {ctx.branch.demo && (
        <p className="notice">
          <T>
            {"Practice mode: preview broadcasts without contacting anyone."}
          </T>
        </p>
      )}
      <section className="panel">
        <BroadcastForm
          customers={customers}
          doctors={doctors}
          shopName={ctx.branch.name}
          phone={ctx.branch.phone}
        />
      </section>
      <h2>
        <T>{"Previous broadcasts"}</T>
      </h2>
      <ListToolbar q={q} placeholder="Search announcements" />
      {!broadcasts.length ? (
        <Empty>
          <T>{"No broadcasts yet."}</T>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Announcement"}</T>
                </th>
                <th>
                  <T>{"Channel"}</T>
                </th>
                <th>
                  <T>{"Recipients"}</T>
                </th>
                <th>
                  <T>{"Status"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link
                      className="text-link"
                      href={`/notifications/broadcast/${b.id}`}
                    >
                      {b.title}
                    </Link>
                  </td>
                  <td>{b.channel}</td>
                  <td>{b.recipientCount}</td>
                  <td>{b.status.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} count={count} q={q} />
    </>
  );
}
