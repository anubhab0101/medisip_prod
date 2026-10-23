import { T } from "@/lib/i18n/provider";
import { ShopFields } from "@/features/settings/shop-fields";
import { LoyaltySettings } from "@/features/loyalty/settings";
import Link from "next/link";
import { branchAction } from "@/features/settings/staff-actions";
import { context } from "@/server/context";
import { Permission } from "@/lib/permissions";
import { ActionForm } from "@/components/shared/action-form";
import { PageTitle } from "@/components/shared/page";
import { shopAction } from "@/features/settings/actions";
export default async function Settings() {
  const { branch } = await context(Permission.SETTINGS);
  return (
    <>
      <PageTitle
        title="Settings"
        description="Shop details shown on every invoice."
      />
      <div className="toolbar">
        <Link className="button secondary" href="/settings/setup">
          <T>{"Setup guide"}</T>
        </Link>
        <Link className="button secondary" href="/settings/staff">
          <T>{"Manage staff"}</T>
        </Link>
        <Link className="button secondary" href="/settings/practice">
          <T>Practice shop</T>
        </Link>
      </div>
      <section className="panel">
        <ActionForm action={shopAction} label="Save shop details">
          <ShopFields branch={branch} />
        </ActionForm>
      </section>
      <LoyaltySettings branch={branch} />
      <details className="panel disclosure">
        <summary>
          <T>{"+ Add another shop"}</T>
        </summary>
        <ActionForm action={branchAction} label="Add shop">
          <div className="fields">
            <label>
              <T>{"Shop name"}</T>
              <input name="name" required />
            </label>
            <label>
              <T>{"Address"}</T>
              <input name="address" required minLength={5} />
            </label>
            <label>
              <T>{"Phone"}</T>
              <input name="phone" required />
            </label>
          </div>
          <label className="checkbox">
            <input name="demo" type="checkbox" defaultChecked />
            <T>{"Practice shop (messages and printing disabled)"}</T>
          </label>
        </ActionForm>
      </details>
    </>
  );
}
