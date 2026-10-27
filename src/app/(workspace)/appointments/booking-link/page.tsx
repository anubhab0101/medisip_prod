import { T } from "@/lib/i18n/provider";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { ActionForm } from "@/components/shared/action-form";
import { bookingLinkAction } from "@/features/public-booking/actions";
import { PageTitle } from "@/components/shared/page";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
export default async function BookingLink() {
  const ctx = await context(Permission.SETTINGS);
  const link = await db().publicBookingLink.findUnique({
    where: { branchId: ctx.branch.id },
  });
  const origin = new URL(process.env.APP_URL ?? "http://127.0.0.1:3000").origin;
  return (
    <>
      <PageTitle title="Public booking link" description="Let customers request an appointment without signing in." action={<Link className="button secondary" href="/appointments"><T>{"Appointments"}</T></Link>} />
      <p className="booking-link-intro">
        <T>
          {
            "Customers can book a doctor visit without signing in. Staff pages remain protected. Only enable this when you are ready to accept bookings."
          }
        </T>
      </p>
      {ctx.branch.demo ? (
        <p className="notice">
          <T>{"Public booking is disabled in practice shops."}</T>
        </p>
      ) : (
        <section className="panel public-link-panel">
          <div className="public-link-status">
            <span className="public-link-status-icon"><ExternalLink size={19} aria-hidden="true" /></span>
            <div><strong><T>{"Customer booking page"}</T></strong><small><T>{"Status: "}</T><span className={link?.active ? "booking-status enabled" : "booking-status"}><T>{link?.active ? "Enabled" : "Disabled"}</T></span></small></div>
          </div>
          {link?.active && (
            <label>
              <T>{"Share this link with customers"}</T>
              <input readOnly value={`${origin}/booking/${link.token}`} />
            </label>
          )}
          <div className="booking-link-safety"><ShieldCheck size={17} aria-hidden="true" /><p>
            <T>
              {
                "Bookings appear in Appointments. Phone numbers are not verified; confirm the visit with the customer. Public requests do not enable messaging consent or send automatic SMS."
              }
            </T>
          </p></div>
          <details className="booking-link-controls">
            <summary><T>{"Change booking link"}</T></summary>
          <ActionForm action={bookingLinkAction} label="Update booking link">
            <label>
              <T>{"Action"}</T>
              <select
                name="command"
                defaultValue={link?.active ? "disable" : "enable"}
              >
                <option value="enable">
                  <T>{"Enable booking"}</T>
                </option>
                <option value="disable">
                  <T>{"Disable booking"}</T>
                </option>
                <option value="replace">
                  <T>{"Replace link (old link stops working)"}</T>
                </option>
              </select>
            </label>
            <label className="checkbox">
              <input type="checkbox" name="confirmed" required />
              <T>{"I confirm this change."}</T>
            </label>
          </ActionForm>
          </details>
        </section>
      )}
    </>
  );
}
