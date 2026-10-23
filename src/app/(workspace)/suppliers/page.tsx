import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { pagination } from "@/lib/validation";
import {
  PageTitle,
  ListToolbar,
  Pagination,
  Empty,
} from "@/components/shared/page";
import { ActionForm } from "@/components/shared/action-form";
import { updateSupplierAction } from "@/features/suppliers/actions";
export default async function Suppliers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.STOCK_WRITE);
  const { q, page } = pagination.parse(await searchParams);
  const where = { branchId: ctx.branch.id, name: { contains: q } };
  const [rows, count] = await Promise.all([
    db().supplier.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().supplier.count({ where }),
  ]);
  return (
    <>
      <PageTitle
        title="Suppliers"
        description="Edit contact details or archive a supplier you no longer use."
        action={
          <Link href="/purchases" className="button secondary">
            <T>{"Back to purchases"}</T>
          </Link>
        }
      />
      <ListToolbar q={q} />
      {!rows.length ? (
        <Empty>
          <T>{"Add your first supplier from Purchases."}</T>
        </Empty>
      ) : (
        rows.map((row) => (
          <details key={row.id} className="panel disclosure">
            <summary>
              {row.name}
              {!row.active && " · Archived"}
            </summary>
            <ActionForm action={updateSupplierAction} label="Save supplier">
              <input type="hidden" name="id" value={row.id} />
              <div className="fields">
                <label>
                  <T>{"Name"}</T>
                  <input
                    name="name"
                    defaultValue={row.name}
                    required
                    maxLength={150}
                  />
                </label>
                <label>
                  <T>{"Phone"}</T>
                  <input name="phone" defaultValue={row.phone} maxLength={30} />
                </label>
                <label>
                  GSTIN
                  <input name="gstin" defaultValue={row.gstin} maxLength={30} />
                </label>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={row.active}
                />
                <T>{"Available for new purchases"}</T>
              </label>
              <label className="checkbox">
                <input type="checkbox" name="confirmed" />
                <T>
                  {
                    "If archiving, I understand this hides the supplier from new purchases. History is kept."
                  }
                </T>
              </label>
            </ActionForm>
          </details>
        ))
      )}
      <Pagination page={page} count={count} q={q} />
    </>
  );
}
