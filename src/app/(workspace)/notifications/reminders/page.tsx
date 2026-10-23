import { T } from "@/lib/i18n/provider";
import Link from "next/link";

import { Prisma } from "@prisma/client";

import { context } from "@/server/context";

import { db } from "@/server/db";

import { Permission } from "@/lib/permissions";

import { PageTitle, Empty } from "@/components/shared/page";

import { ActionForm } from "@/components/shared/action-form";

import { cancelReminderAction } from "@/features/notifications/reminder-actions";

export default async function Reminders() {
  const ctx = await context(Permission.MESSAGES);

  const jobs = await db().$queryRaw<
    {
      id: string;
      type: string;
      status: string;
      runAt: Date;
      lastError: string | null;
      customerName: string;
    }[]
  >(
    Prisma.sql`SELECT j.id,j.type,j.status,j.runAt,j.lastError,c.name AS customerName FROM Job j JOIN Customer c ON c.id=JSON_UNQUOTE(JSON_EXTRACT(j.payload,'$.customerId')) AND c.branchId=${ctx.branch.id} WHERE JSON_UNQUOTE(JSON_EXTRACT(j.payload,'$.branchId'))=${ctx.branch.id} AND j.type IN ('REFILL_REMINDER','CREDIT_REMINDER') ORDER BY j.createdAt DESC LIMIT 100`,
  );

  return (
    <>
      <PageTitle
        title="Reminders"
        description="Schedule from a customer’s page. Pending reminders can be cancelled here."
        action={
          <Link className="button secondary" href="/customers">
            <T>{"Customers"}</T>
          </Link>
        }
      />
      {!jobs.length ? (
        <Empty>
          <T>{"No reminders yet."}</T>
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
                  <T>{"Reminder"}</T>
                </th>
                <th>
                  <T>{"India time"}</T>
                </th>
                <th>
                  <T>{"Status"}</T>
                </th>
                <th>
                  <T>{"Action"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.customerName}</td>
                  <td>
                    <T>
                      {job.type === "REFILL_REMINDER" ? "Refill" : "Credit"}
                    </T>
                  </td>
                  <td>
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(job.runAt)}
                  </td>
                  <td>
                    {job.status}
                    <small>{job.lastError}</small>
                  </td>
                  <td>
                    {job.status === "PENDING" && (
                      <ActionForm action={cancelReminderAction} label="Cancel">
                        <input type="hidden" name="jobId" value={job.id} />
                      </ActionForm>
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
