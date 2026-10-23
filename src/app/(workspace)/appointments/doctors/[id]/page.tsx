import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { notFound } from "next/navigation";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission, can } from "@/lib/permissions";
import { PageTitle } from "@/components/shared/page";
import { DoctorEditForm } from "@/features/appointments/edit-form";
export default async function DoctorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await context(Permission.APPOINTMENT);
  const { id } = await params;
  const doctor = await db().doctor.findFirst({
    where: { id, branchId: ctx.branch.id },
    include: { availability: true },
  });
  if (!doctor) notFound();
  const canLink = can(ctx.role, Permission.USERS);
  const members = canLink
    ? await db().membership.findMany({
        where: {
          branchId: ctx.branch.id,
          role: "DOCTOR",
          user: { active: true },
        },
        include: { user: { select: { id: true, name: true } } },
      })
    : [];
  return (
    <>
      <PageTitle
        title="Edit doctor"
        action={
          <Link href="/appointments/doctors" className="button secondary">
            <T>{"Back"}</T>
          </Link>
        }
      />
      <section className="panel">
        <DoctorEditForm
          doctor={doctor}
          accounts={members.map((m) => m.user)}
          canLink={canLink}
        />
      </section>
    </>
  );
}
