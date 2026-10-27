import Link from "next/link";
import { signOut } from "@/auth";
import { db } from "@/server/db";
import { assertPlatformAdmin } from "@/lib/platform-admin";
import { createPlatformShop, deleteEmptyPlatformShop, setPlatformShopStatus } from "@/features/platform/actions";

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  const admin = await assertPlatformAdmin();
  const [{ error, deleted }, shops] = await Promise.all([
    searchParams,
    db().branch.findMany({ orderBy: { createdAt: "desc" }, include: { memberships: { where: { role: "OWNER" }, include: { user: { select: { id: true, name: true, email: true } } } }, providerIntegrations: { select: { provider: true, enabled: true, lastTestStatus: true } } } }),
  ]);
  const creationError = error === "owner_details"
    ? "New owner ke liye owner name aur 12+ character temporary password bharo. Existing owner email par password ki zaroorat nahi."
    : error === "owner_inactive"
      ? "Is email ka owner account inactive hai. Pehle account reactivate karo, phir shop link karo."
      : error === "owner_conflict"
        ? "Owner email pehle se is shop se linked hai. Doosra email use karo ya existing shop manage karo."
        : error === "invalid_details"
          ? "Shop details check karo: name, address, phone aur valid owner email required hain."
          : error === "create_failed"
            ? "Shop save nahi hua. Server log mein error code check karo; migration/database connection bhi verify karo."
            : error === "shop_name_mismatch"
              ? "Delete confirm nahi hua. Shop ka naam bilkul waise hi type karo."
              : error === "shop_has_data"
                ? "Is shop mein business records ya shared booking link hai. Data safety ke liye delete nahi kiya; zaroorat ho to suspend karo."
                : error === "shop_missing"
                  ? "Ye shop pehle hi remove ho chuka hai. List refresh kar lo."
                  : error === "shop_delete_failed"
                    ? "Shop remove nahi hua. Koi linked data ho sakta hai; shop suspend karo aur server log check karo."
            : null;
  return <main className="platform-main">
    <header className="platform-header"><div><p className="eyebrow">MEDISHOP · PLATFORM</p><h1>Shops</h1><p>Manage shop accounts and messaging connections.</p></div><div className="platform-header-actions"><span>{admin.email}</span><form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="button secondary">Sign out</button></form></div></header>
    {creationError && <p className="error" role="alert">{creationError}</p>}
    {deleted && <p className="success" role="status">Removed empty shop: {deleted}</p>}
    <section className="panel"><div className="page-title"><div><h2>Add a shop</h2><p>Set up the owner account and give them the temporary password separately.</p></div></div>
      <form action={createPlatformShop} className="stack platform-form">
        <div className="fields"><label>Shop name<input name="name" required minLength={2} maxLength={191} /></label><label>Shop phone<input name="phone" type="tel" required minLength={10} maxLength={20} /></label><label>Owner name <span className="optional-label">new account only</span><input name="ownerName" minLength={2} maxLength={191} /></label></div>
        <label>Shop address<textarea name="address" required minLength={5} maxLength={1000} /></label>
        <div className="fields"><label>Owner email<input name="ownerEmail" type="email" required maxLength={191} /></label><label>Temporary password <span className="optional-label">new account only</span><input name="initialPassword" type="password" minLength={12} maxLength={72} autoComplete="new-password" /><small>New owners change this password at first sign-in. An existing owner email links the shop to that account.</small></label></div>
        <button className="button">Create shop</button>
      </form>
    </section>
    <section className="panel"><div className="page-title"><div><h2>All shops <span className="count-badge">{shops.length}</span></h2><p>Provider credentials are encrypted and hidden after save.</p></div></div>
      {shops.length ? <div className="table-wrap"><table><thead><tr><th>Shop</th><th>Owner</th><th>Messaging</th><th>Status</th><th /></tr></thead><tbody>{shops.map((shop) => <tr key={shop.id}><td><strong>{shop.name}</strong><small>{shop.phone}</small><small>Added {shop.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</small></td><td>{shop.memberships[0]?.user.name ?? "No owner"}<small>{shop.memberships[0]?.user.email ?? ""}</small></td><td>{shop.providerIntegrations.filter((p) => p.enabled).length} enabled</td><td><span className={`status-pill ${shop.active ? "is-active" : "is-paused"}`}>{shop.active ? "Active" : "Suspended"}</span></td><td className="platform-row-actions"><Link className="button secondary" href={`/platform/shops/${shop.id}`}>Manage</Link><form action={setPlatformShopStatus}><input type="hidden" name="branchId" value={shop.id} /><input type="hidden" name="active" value={shop.active ? "false" : "true"} /><button className="button secondary">{shop.active ? "Suspend" : "Activate"}</button></form><details className="platform-delete"><summary>Delete</summary><form action={deleteEmptyPlatformShop}><input type="hidden" name="branchId" value={shop.id} /><label>Type “{shop.name}” to confirm<input name="confirmation" required minLength={2} maxLength={191} autoComplete="off" /></label><button className="button danger">Delete empty shop</button><small>Only shops with no bills, stock, customers or shared booking link can be removed. Audit history stays saved.</small></form></details></td></tr>)}</tbody></table></div> : <p>No shops yet. Create the first shop above.</p>}
    </section>
  </main>;
}
