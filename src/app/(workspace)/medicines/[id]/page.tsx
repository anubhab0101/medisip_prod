import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission, can } from "@/lib/permissions";
import { PageTitle } from "@/components/shared/page";
import { ActionForm } from "@/components/shared/action-form";
import { MedicineFields } from "@/features/stock/medicine-fields";
import {
  editMedicineAction,
  archiveMedicineAction,
} from "@/features/stock/actions";
export default async function MedicineDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await context(Permission.STOCK_READ);
  const { id } = await params;
  const medicine = await db().medicine.findFirst({
    where: { id, branchSettings: { some: { branchId: ctx.branch.id } } },
    include: { branchSettings: { where: { branchId: ctx.branch.id } } },
  });
  if (!medicine) notFound();
  const setting = medicine.branchSettings[0];
  return (
    <>
      <Link className="text-link" href={`/medicines/${id}/substitutes`}>
        <T>{"Find alternatives with the same ingredient"}</T>
      </Link>
      <PageTitle
        title={medicine.name}
        description={
          setting.active ? "Medicine details" : "Archived in this shop"
        }
        action={
          <Link
            className="button secondary"
            href={`/stock/history?medicine=${id}`}
          >
            <T>{"Stock history"}</T>
          </Link>
        }
      />
      {can(ctx.role, Permission.MEDICINE_WRITE) ? (
        <>
          <section className="panel">
            <ActionForm action={editMedicineAction} label="Save changes">
              <input name="id" type="hidden" value={id} />
              <MedicineFields medicine={medicine} settings={setting} />
            </ActionForm>
          </section>
          <details className="panel disclosure">
            <summary>
              <T>{setting.active ? "Archive medicine" : "Restore medicine"}</T>
            </summary>
            <ActionForm
              action={archiveMedicineAction}
              label={setting.active ? "Archive" : "Restore"}
            >
              <input name="id" type="hidden" value={id} />
              <input
                name="active"
                type="hidden"
                value={String(!setting.active)}
              />
              <p>
                <T>
                  {setting.active
                    ? "This hides the medicine from new bills and purchases in this shop. Its stock and history are kept."
                    : "This makes the medicine available for new bills and purchases again."}
                </T>
              </p>
              <label className="checkbox">
                <input type="checkbox" name="confirmed" required />
                <T>{"I understand and want to continue."}</T>
              </label>
            </ActionForm>
          </details>
        </>
      ) : (
        <section className="panel">
          <p>
            {medicine.genericName} · {medicine.strength} · {medicine.packSize}
          </p>
          <p>
            <T>{"Rack: "}</T>
            {setting.rack || "—"}
          </p>
        </section>
      )}
      <Link className="text-link" href="/medicines">
        <T>{"Back to medicines"}</T>
      </Link>
    </>
  );
}
