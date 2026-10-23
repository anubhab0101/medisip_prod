import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { PageTitle } from "@/components/shared/page";
export default async function Doctors() {
  const ctx = await context(Permission.APPOINTMENT);
  const doctors = await db().doctor.findMany({
    where: { branchId: ctx.branch.id },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageTitle
        title="Doctors & hours"
        action={
          <Link href="/appointments" className="button secondary">
            <T>{"Appointments"}</T>
          </Link>
        }
      />
      {doctors.map((d) => (
        <p className="panel" key={d.id}>
          <Link className="text-link" href={`/appointments/doctors/${d.id}`}>
            {d.name}
          </Link>{" "}
          · {d.specialization} · <T>{d.active ? "Active" : "Inactive"}</T>
        </p>
      ))}
    </>
  );
}
