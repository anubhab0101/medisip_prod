import Link from "next/link";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { PageTitle, Empty } from "@/components/shared/page";
import { ActionForm } from "@/components/shared/action-form";
import { T } from "@/lib/i18n/provider";
import { uploadPrescriptionAction, reviewPrescriptionAction } from "@/features/prescriptions/actions";

export default async function Prescriptions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.PRESCRIPTION);
  const params = await searchParams;
  const status = ["PENDING", "APPROVED", "REJECTED"].includes(params.status ?? "")
    ? params.status as "PENDING" | "APPROVED" | "REJECTED"
    : undefined;
  const [customers, records] = await Promise.all([
    db().customer.findMany({
      where: { branchId: ctx.branch.id, active: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    db().prescription.findMany({
      where: { branchId: ctx.branch.id, ...(status ? { status } : {}) },
      select: {
        id: true, customerId: true, doctorName: true, reference: true,
        fileName: true, mimeType: true, status: true, reviewNote: true,
        reviewedAt: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return (
    <>
      <PageTitle title="Prescriptions" description="Keep prescription copies private and record pharmacist review." />
      <section className="panel stack">
        <h2><T>Upload a prescription</T></h2>
        <p><T>Link each file to a customer. Only this shop’s owner and pharmacist can open or review it. Maximum 2 MB; PDF, JPEG or PNG.</T></p>
        <ActionForm action={uploadPrescriptionAction} label="Upload for review">
          <div className="fields">
            <label><T>Customer</T>
              <select name="customerId" defaultValue="" required>
                <option value=""><T>Choose a customer</T></option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}
              </select>
            </label>
            <label><T>Doctor name</T><input name="doctorName" required maxLength={150} /></label>
            <label><T>Prescription reference</T><input name="reference" required maxLength={200} /></label>
            <label><T>Prescription file</T><input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></label>
          </div>
        </ActionForm>
      </section>
      <section className="panel stack">
        <div className="section-heading"><h2><T>Review queue</T></h2>
          <nav className="tabs" aria-label="Prescription status">
            <Link href="/prescriptions"><T>All</T></Link>
            <Link href="/prescriptions?status=PENDING"><T>Pending</T></Link>
            <Link href="/prescriptions?status=APPROVED"><T>Approved</T></Link>
            <Link href="/prescriptions?status=REJECTED"><T>Rejected</T></Link>
          </nav>
        </div>
        {!records.length ? <Empty><T>No prescriptions in this view.</T></Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th><T>Received</T></th><th><T>Customer</T></th><th><T>Doctor / reference</T></th><th><T>File</T></th><th><T>Status</T></th><th><T>Review</T></th></tr></thead>
            <tbody>{records.map((record) => (
              <tr key={record.id}>
                <td>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(record.createdAt)}</td>
                <td>{customers.find((customer) => customer.id === record.customerId)?.name ?? <T>Not linked</T>}</td>
                <td>{record.doctorName}<br /><small>{record.reference}</small></td>
                <td><Link className="text-link" href={`/api/prescriptions/${record.id}/file`} target="_blank" rel="noreferrer">{record.fileName}</Link></td>
                <td>{record.status}</td>
                <td>{record.status === "PENDING" ? (
                  <div className="stack">
                    {(["APPROVED", "REJECTED"] as const).map((nextStatus) => (
                      <ActionForm key={nextStatus} action={reviewPrescriptionAction} label={nextStatus === "APPROVED" ? "Approve" : "Reject"}>
                        <input type="hidden" name="id" value={record.id} />
                        <input type="hidden" name="status" value={nextStatus} />
                        <label><T>Review note (optional)</T><input name="reviewNote" maxLength={500} /></label>
                      </ActionForm>
                    ))}
                  </div>
                ) : <small>{record.reviewNote || "—"}</small>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
