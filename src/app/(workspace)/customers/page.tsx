import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { db } from "@/server/db";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { pagination } from "@/lib/validation";
import { ActionForm } from "@/components/shared/action-form";
import {
  PageTitle,
  ListToolbar,
  Pagination,
  Empty,
} from "@/components/shared/page";
import { customerAction } from "@/features/customers/actions";
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(Permission.CUSTOMER);
  const { q, page } = pagination.parse(await searchParams);
  const where = {
    branchId: ctx.branch.id,
    active: true,
    OR: [{ name: { contains: q } }, { phone: { contains: q } }],
  };
  const [items, count] = await Promise.all([
    db().customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db().customer.count({ where }),
  ]);
  return (
    <>
      <PageTitle
        title="Customers"
        description="Customer details and message preferences."
      />
      <details className="panel disclosure">
        <summary>
          <T>{"+ Add customer"}</T>
        </summary>
        <ActionForm action={customerAction} label="Add customer">
          <div className="fields">
            <label>
              <T>{"Name"}</T>
              <input name="name" required />
            </label>
            <label>
              <T>{"Mobile number"}</T>
              <LocalizedInput
                name="phone"
                type="tel"
                placeholder="10-digit mobile number"
                required
              />
            </label>
            <label>
              <T>{"Email (optional)"}</T>
              <input name="email" type="email" />
            </label>
          </div>
          <p>
            <T>{"Only tick the channels the customer agreed to."}</T>
          </p>
          <div className="inline">
            <label className="checkbox">
              <input name="consentSms" type="checkbox" />
              SMS
            </label>
            <label className="checkbox">
              <input name="consentWhatsapp" type="checkbox" />
              WhatsApp
            </label>
            <label className="checkbox">
              <input name="consentEmail" type="checkbox" />
              <T>{"Email"}</T>
            </label>
          </div>
        </ActionForm>
      </details>
      <ListToolbar q={q} placeholder="Name or mobile number" />
      {!items.length ? (
        <Empty>
          <T>
            {
              "No customers found. Add a customer when making a bill, or use the form above."
            }
          </T>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Name"}</T>
                </th>
                <th>
                  <T>{"Phone"}</T>
                </th>
                <th>
                  <T>{"Email"}</T>
                </th>
                <th>
                  <T>{"Messages allowed"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="text-link" href={`/customers/${c.id}`}>
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.email || "—"}</td>
                  <td>
                    {[
                      c.consentSms && "SMS",
                      c.consentWhatsapp && "WhatsApp",
                      c.consentEmail && "Email",
                    ]
                      .filter(Boolean)
                      .join(", ") || "None"}
                  </td>
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
