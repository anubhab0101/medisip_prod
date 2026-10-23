import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { ActionForm } from "@/components/shared/action-form";
import { PageTitle } from "@/components/shared/page";
import { staffAction, accessAction } from "@/features/settings/staff-actions";
export default async function Staff() {
  const ctx = await context(Permission.USERS);
  const members = await db().membership.findMany({
    where: { branchId: ctx.branch.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return (
    <>
      <PageTitle
        title="Staff"
        description="Choose what each person can do in this shop."
        action={
          <Link className="button secondary" href="/settings">
            <T>{"Back"}</T>
          </Link>
        }
      />
      <details className="panel disclosure">
        <summary>
          <T>{"+ Add staff"}</T>
        </summary>
        <ActionForm action={staffAction} label="Create account">
          <div className="fields">
            <label>
              <T>{"Name"}</T>
              <input name="name" required />
            </label>
            <label>
              <T>{"Email"}</T>
              <input name="email" type="email" required />
            </label>
            <label>
              <T>{"Temporary password"}</T>
              <input
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
              />
              <small>
                <T>{"At least 12 characters. Share privately."}</T>
              </small>
            </label>
            <label>
              <T>{"Role"}</T>
              <select name="role">
                <option value="CASHIER">
                  <T>{"Cashier"}</T>
                </option>
                <option value="PHARMACIST">
                  <T>{"Pharmacist"}</T>
                </option>
                <option value="DOCTOR">
                  <T>{"Doctor"}</T>
                </option>
                <option value="OWNER">
                  <T>{"Owner"}</T>
                </option>
              </select>
            </label>
          </div>
        </ActionForm>
      </details>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <T>{"Name"}</T>
              </th>
              <th>
                <T>{"Email"}</T>
              </th>
              <th>
                <T>{"Access"}</T>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>{m.user.name}</td>
                <td>{m.user.email}</td>
                <td>
                  {m.userId === ctx.user.id ? (
                    <span>
                      {m.role}
                      <T>{" · You"}</T>
                    </span>
                  ) : (
                    <ActionForm action={accessAction} label="Update access">
                      <input type="hidden" name="userId" value={m.userId} />
                      <label>
                        <span className="sr-only">
                          <T>{"Role"}</T>
                        </span>
                        <select name="role" defaultValue={m.role}>
                          {["CASHIER", "PHARMACIST", "DOCTOR", "OWNER"].map(
                            (role) => (
                              <option key={role}>{role}</option>
                            ),
                          )}
                        </select>
                      </label>
                      <label className="checkbox">
                        <input name="remove" type="checkbox" />
                        <T>{"Remove access to this shop"}</T>
                      </label>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
