import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Channel } from "@prisma/client";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { pagination } from "@/lib/validation";
import { PageTitle, Pagination } from "@/components/shared/page";
import { ActionForm } from "@/components/shared/action-form";
import { confirmBroadcastAction } from "@/features/notifications/broadcast-actions";
import { ManualBroadcastButton } from "@/features/notifications/manual-broadcast-button";
export default async function BroadcastDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.MESSAGES);
  const { id } = await params;
  const { page } = pagination.parse(await searchParams);
  const broadcast = await db().broadcast.findFirst({
    where: { id, branchId: ctx.branch.id },
  });
  if (!broadcast) notFound();
  const where = { branchId: ctx.branch.id, broadcastId: id };
  const [logs, count, totals] = await Promise.all([
    db().notificationLog.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().notificationLog.count({ where }),
    db().notificationLog.groupBy({ by: ["status"], where, _count: true }),
  ]);
  const customers = await db().customer.findMany({
    where: {
      branchId: ctx.branch.id,
      id: { in: logs.map((l) => l.customerId) },
    },
    select: { id: true, name: true, phone: true },
  });
  const smsReady =
    process.env.SMS_SEND_ENABLED === "true" &&
    !!process.env.SMSGATE_USERNAME &&
    !!process.env.SMSGATE_PASSWORD;
  const whatsappReady = process.env.EVOLUTION_GO_SEND_ENABLED === "true";
  return (
    <>
      <PageTitle
        title={broadcast.title}
        description={`${broadcast.channel} announcement`}
        action={
          <Link href="/notifications/broadcast" className="button secondary">
            <T>{"All broadcasts"}</T>
          </Link>
        }
      />
      <section className="panel stack">
        <p className="message-body">{broadcast.body}</p>
        <p>
          <strong>
            {broadcast.recipientCount}
            <T>{" eligible customers"}</T>
          </strong>{" "}
          · {broadcast.skippedCount}
          <T>{" skipped for consent or contact details"}</T>
        </p>
        <small>
          <T>{"Sending window starts"}</T>{" "}
          {broadcast.scheduledFor.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          IST
          {broadcast.expiresAt &&
            ` · Expires ${broadcast.expiresAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`}
        </small>
        {broadcast.status === "DRAFT" &&
          (ctx.branch.demo ? (
            <p className="notice">
              <T>{"Preview only: sending is disabled in practice mode."}</T>
            </p>
          ) : broadcast.channel === Channel.SMS && !smsReady ? (
            <p className="notice">
              <T>
                {
                  "Connect SMSGate and enable SMS sending before confirming this broadcast."
                }
              </T>
            </p>
          ) : (
            <ActionForm
              action={confirmBroadcastAction}
              label={
                broadcast.channel === Channel.SMS
                  ? "Confirm and queue SMS"
                  : broadcast.channel === Channel.WHATSAPP && whatsappReady
                    ? "Confirm and queue WhatsApp"
                    : "Confirm manual broadcast"
              }
            >
              <input type="hidden" name="id" value={id} />
              <label className="checkbox">
                <input type="checkbox" name="confirmed" required />
                <T>{"I reviewed this message and the recipients."}</T>{" "}
                <T>
                  {broadcast.channel === Channel.SMS
                    ? "Queue it for sending."
                    : broadcast.channel === Channel.WHATSAPP && whatsappReady
                      ? "Queue it for WhatsApp delivery."
                      : "Prepare individual messages for me to send."}
                </T>
              </label>
            </ActionForm>
          ))}
        {(broadcast.channel === Channel.EMAIL ||
          (broadcast.channel === Channel.WHATSAPP && !whatsappReady)) && (
          <p>
            <T>
              {
                "WhatsApp and email open one customer at a time. You send the message in that app; delivery is not tracked here."
              }
            </T>
          </p>
        )}
      </section>
      <div className="toolbar">
        {totals.map((t) => (
          <span className="chip" key={t.status}>
            {t.status.replaceAll("_", " ")}: {t._count}
          </span>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <T>{"Customer"}</T>
              </th>
              <th>
                <T>{"Status"}</T>
              </th>
              <th>
                <T>{"Action / details"}</T>
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const c = customers.find((c) => c.id === log.customerId);
              return (
                <tr key={log.id}>
                  <td>
                    {c?.name ?? "Archived customer"}
                    <small>{c?.phone}</small>
                  </td>
                  <td>{log.status.replaceAll("_", " ")}</td>
                  <td>
                    {log.error ||
                      ([
                        "READY_FOR_MANUAL_SEND",
                        "PREPARED_FOR_MANUAL_SEND",
                      ].includes(log.status) && (
                        <ManualBroadcastButton logId={log.id} />
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} count={count} q="" />
    </>
  );
}
