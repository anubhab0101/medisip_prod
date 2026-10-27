import Link from "next/link";
import { notFound } from "next/navigation";
import { ProviderKind } from "@prisma/client";
import { db } from "@/server/db";
import { assertPlatformAdmin } from "@/lib/platform-admin";
import { saveProviderConfig, setPlatformShopStatus, setProviderEnabled, testProviderConnection } from "@/features/platform/actions";
import { PasswordResetForm } from "@/features/platform/password-reset-form";

export default async function PlatformShopPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; linked?: string; test?: string }> }) {
  await assertPlatformAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const shop = await db().branch.findUnique({ where: { id }, include: { memberships: { orderBy: { role: "asc" }, include: { user: { select: { id: true, name: true, email: true, active: true } } } }, providerIntegrations: true } });
  if (!shop) notFound();
  const sms = shop.providerIntegrations.find((p) => p.provider === ProviderKind.SMSGATE);
  const whatsApp = shop.providerIntegrations.find((p) => p.provider === ProviderKind.EVOLUTION_GO);
  const providerCard = (provider: ProviderKind, saved: typeof sms, title: string) => <section className="panel provider-card" key={provider}>
    <div className="page-title"><div><h2>{title}</h2><p>{saved ? `Saved · ${saved.lastTestStatus ?? "Not tested"}${saved.lastTestAt ? ` · ${saved.lastTestAt.toLocaleString()}` : ""}` : "Not connected"}</p></div><span className={`status-pill ${saved?.enabled ? "is-active" : "is-paused"}`}>{saved?.enabled ? "Enabled" : "Disabled"}</span></div>
    <p className="provider-hint">{saved ? "Saved credentials are hidden. Enter them again only when rotating or changing this connection." : "Credentials are encrypted when saved and never shown again."}</p>
    <form action={saveProviderConfig} className="stack platform-form">
      <input type="hidden" name="branchId" value={shop.id} /><input type="hidden" name="provider" value={provider} />
      {provider === ProviderKind.SMSGATE ? <div className="fields"><label>SMSGate username<input name="username" autoComplete="off" required /></label><label>SMSGate password<input name="password" type="password" autoComplete="new-password" required /></label><label>Device ID <span className="optional-label">optional</span><input name="deviceId" autoComplete="off" /></label></div> : <div className="fields"><label>Evolution Go server URL<input name="baseUrl" type="url" placeholder="https://your-evolution-server" required /></label><label>Instance token<input name="token" type="password" autoComplete="new-password" required /></label></div>}
      <button className="button">Save settings</button>
    </form>
    <form action={testProviderConnection} className="inline platform-test-form"><input type="hidden" name="branchId" value={shop.id} /><input type="hidden" name="provider" value={provider} /><label>Test number (10 digits or +91)<input name="phone" type="tel" placeholder="8260586748 or +918260586748" required pattern="(?:\\+?91)?[6-9][0-9]{9}" /></label><label className="checkbox"><input type="checkbox" name="confirmed" required />Send one labelled test message to this number</label><button className="button secondary">Send test</button></form>
    {saved && <form action={setProviderEnabled} className="inline provider-toggle"><input type="hidden" name="branchId" value={shop.id} /><input type="hidden" name="provider" value={provider} /><button className="button secondary" name="enabled" value={saved.enabled ? "false" : "true"}>{saved.enabled ? "Disable sending" : "Enable sending"}</button><span>Enable only after a successful test.</span></form>}
    {saved?.lastTestMessage && <p className={`provider-result ${saved.lastTestStatus === "SUCCESS" ? "success" : "notice"}`} role="status">{saved.lastTestMessage}</p>}
  </section>;
  return <main className="platform-main"><nav className="platform-breadcrumb"><Link href="/platform">← All shops</Link></nav>
    <header className="platform-header"><div><p className="eyebrow">SHOP DETAILS</p><h1>{shop.name}</h1><p>{shop.address} · {shop.phone}</p></div><form action={setPlatformShopStatus}><input type="hidden" name="branchId" value={shop.id} /><input type="hidden" name="active" value={shop.active ? "false" : "true"} /><button className="button secondary">{shop.active ? "Suspend shop" : "Activate shop"}</button></form></header>
    {query.created && <p className="success" role="status">Shop created. Give the owner the temporary password you set; they must change it at first sign-in.</p>}
    {query.linked && <p className="success" role="status">Shop linked to the existing owner account. They can switch shops from their workspace.</p>}
    {query.test === "success" && <p className="success" role="status">Test message accepted by the provider.</p>}{query.test === "failed" && <p className="error" role="alert">Test message failed. Check the result below and the provider settings.</p>}
    <section className="panel platform-users">
      <div className="page-title"><div><h2>Shop logins</h2><p>Reset a member’s password if they cannot sign in.</p></div></div>
      <p className="provider-hint">A new temporary password appears once after reset. Share it privately; the member must change it at next sign-in. If this login is used by multiple shops, the reset applies to all of them.</p>
      {shop.memberships.length ? <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Login access</th><th>Password</th></tr></thead><tbody>{shop.memberships.map((membership) => <tr key={membership.user.id}>
        <td><strong>{membership.user.name}</strong><small>{membership.user.email}</small></td>
        <td>{membership.role.toLowerCase()}</td>
        <td>{membership.user.active ? "Active" : "Inactive"}</td>
        <td>{membership.user.active ? <PasswordResetForm branchId={shop.id} userId={membership.user.id} /> : <small>Activate this account before resetting.</small>}</td>
      </tr>)}</tbody></table></div> : <p>No shop members found.</p>}
    </section>
    {providerCard(ProviderKind.SMSGATE, sms, "SMSGate")}{providerCard(ProviderKind.EVOLUTION_GO, whatsApp, "Evolution Go · WhatsApp")}
  </main>;
}
