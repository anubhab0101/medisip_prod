import { T } from "@/lib/i18n/provider";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { PageTitle, Empty } from "@/components/shared/page";
import { MessageForm } from "@/features/notifications/message-form";
import Link from "next/link";
import { ActionForm } from "@/components/shared/action-form";
import { retryMessageAction } from "@/features/notifications/retry-actions";
import { Channel } from "@prisma/client";
const statuses = [
  "QUEUED",
  "PENDING",
  "PROCESSED",
  "SENT",
  "DELIVERED",
  "FAILED",
  "UNKNOWN",
  "SUBMITTING",
  "SKIPPED",
  "PREPARED_FOR_MANUAL_SEND",
  "READY_FOR_MANUAL_SEND",
  "DRAFT",
];
export default async function Notifications({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.MESSAGES);
  const search = await searchParams;
  const channel = Object.values(Channel).includes(search.channel as Channel)
    ? (search.channel as Channel)
    : undefined;
  const status = statuses.includes(search.status ?? "")
    ? search.status
    : undefined;
  const [customers, logs, templates] = await Promise.all([
    db().customer.findMany({
      where: { branchId: ctx.branch.id, active: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    db().notificationLog.findMany({
      where: {
        branchId: ctx.branch.id,
        ...(channel ? { channel } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db().notificationTemplate.findMany({
      where: { branchId: ctx.branch.id, active: true },
      orderBy: { key: "asc" },
    }),
  ]);
  const failedIds = logs
    .filter(
      (log) =>
        log.channel === "SMS" &&
        log.status === "FAILED" &&
        !log.providerId &&
        !log.sentAt,
    )
    .map((log) => log.id);
  const jobs = failedIds.length
    ? await db().job.findMany({
        where: { id: { in: failedIds } },
        select: { id: true, status: true },
      })
    : [];
  const retryable = new Set(
    jobs.filter((job) => job.status === "FAILED").map((job) => job.id),
  );
  return (
    <>
      <PageTitle
        title="Messages"
        description="Send only to customers who have agreed to receive messages."
        action={
          <Link className="button" href="/notifications/broadcast">
            <T>{"+ Broadcast"}</T>
          </Link>
        }
      />
      <p>
        <Link className="text-link" href="/notifications/templates">
          <T>{"Message templates"}</T>
        </Link>
        {" · "}
        <Link className="text-link" href="/notifications/reminders">
          <T>{"Scheduled reminders"}</T>
        </Link>
      </p>
      <section className="panel">
        <MessageForm
          customers={customers}
          templates={templates}
          shop={ctx.branch.name}
          initialTemplateId={search.template}
          testMode={search.test === "1"}
          key={`${search.template ?? ""}:${search.test ?? ""}`}
        />
      </section>
      <form className="toolbar panel">
        <label>
          <T>{"History channel"}</T>
          <select name="channel" defaultValue={channel ?? ""}>
            <option value="">
              <T>{"All channels"}</T>
            </option>
            {Object.values(Channel).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <T>{"History status"}</T>
          <select name="status" defaultValue={status ?? ""}>
            <option value="">
              <T>{"All statuses"}</T>
            </option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">
          <T>{"Filter history"}</T>
        </button>
      </form>
      {!logs.length ? (
        <Empty>
          <T>
            {channel || status
              ? "No messages match these filters."
              : "No message history yet."}
          </T>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Customer"}</T>
                </th>
                <th>
                  <T>{"Channel"}</T>
                </th>
                <th>
                  <T>{"Status"}</T>
                </th>
                <th>
                  <T>{"Date"}</T>
                </th>
                <th>
                  <T>{"Details"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    {customers.find((c) => c.id === log.customerId)?.name ??
                      "Archived customer"}
                  </td>
                  <td>{log.channel}</td>
                  <td>{log.status.replaceAll("_", " ")}</td>
                  <td>
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(log.createdAt)}
                  </td>
                  <td>
                    {log.error && <small>{log.error}</small>}
                    {retryable.has(log.id) && !ctx.branch.demo && (
                      <details>
                        <summary>
                          <T>{"Retry SMS"}</T>
                        </summary>
                        <ActionForm
                          action={retryMessageAction}
                          label="Queue retry"
                        >
                          <input type="hidden" name="id" value={log.id} />
                          <label className="checkbox">
                            <input type="checkbox" name="confirmed" required />
                            <T>
                              {"Retry this failed message for this customer."}
                            </T>
                          </label>
                        </ActionForm>
                      </details>
                    )}
                    {["UNKNOWN", "SUBMITTING"].includes(log.status) && (
                      <small>
                        <T>
                          {
                            "Check SMSGate for delivery. Resending is blocked while the result is uncertain."
                          }
                        </T>
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
