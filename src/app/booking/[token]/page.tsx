import { T } from "@/lib/i18n/provider";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { publicBookingInfo } from "@/features/public-booking/service";
import { publicBookingAction } from "@/features/public-booking/actions";
import { ActionForm } from "@/components/shared/action-form";
import { shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { CalendarDays, Clock3, ShieldCheck, Store } from "lucide-react";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Book a doctor visit",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export default async function PublicBooking({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  let info;
  try {
    info = await publicBookingInfo(
      token,
      query.date || shopDate(),
      query.doctor,
    );
  } catch {
    return (
      <main className="public-booking-page">
        <section className="public-booking-card booking-message-card">
          <div className="public-booking-mark"><CalendarDays size={20} /></div>
          <h1><T>{"Choose a valid booking date"}</T></h1>
          <p><T>{"Open the original booking link and choose a date within the next 30 days."}</T></p>
        </section>
      </main>
    );
  }
  if (!info)
    return (
      <main className="public-booking-page">
        <section className="public-booking-card booking-message-card">
          <div className="public-booking-mark"><Store size={20} /></div>
          <h1><T>{"Booking link unavailable"}</T></h1>
          <p><T>{"Contact the shop for an updated booking link."}</T></p>
        </section>
      </main>
    );
  return (
    <main className="public-booking-page">
      <header className="public-booking-shop">
        <div className="public-booking-mark"><Store size={19} aria-hidden="true" /></div>
        <div><h1>{info.shop.name}</h1><p>{info.shop.address}</p><a href={`tel:${info.shop.phone.replace(/[^+\d]/g, "")}`}>{info.shop.phone}</a></div>
      </header>
      <section className="public-booking-card">
        <div className="public-booking-title">
          <span className="public-booking-step"><CalendarDays size={17} aria-hidden="true" /></span>
          <div><p className="public-booking-eyebrow"><T>{"Appointment booking"}</T></p><h2><T>{"Book a doctor visit"}</T></h2></div>
        </div>
        <p className="public-booking-intro"><T>{"Choose a time, then enter your contact details. All times are India time."}</T></p>
      {!info.doctor ? (
        <div className="booking-notice"><T>{"No doctors are available for online booking. Please contact the shop."}</T></div>
      ) : (
        <>
          <form className="booking-date-form">
            <label>
              <T>{"Doctor"}</T>
              <select name="doctor" defaultValue={info.doctor.id}>
                {info.doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} - {d.specialization}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <T>{"Date"}</T>
              <input
                type="date"
                name="date"
                defaultValue={info.date}
                min={shopDate()}
                max={shopDate(new Date(Date.now() + 30 * 86400000))}
                required
              />
            </label>
            <button className="button secondary booking-show-times">
              <CalendarDays size={16} aria-hidden="true" />
              <T>{"Show times"}</T>
            </button>
          </form>
          <div className="booking-doctor-summary">
            <div><strong>{info.doctor.name}</strong><span>{info.doctor.specialization}</span></div>
            <div className="booking-fee"><span><T>{"Visit fee"}</T></span><strong>{formatMoney(info.doctor.feePaise)}</strong><small><T>{"Pay at the shop"}</T></small></div>
          </div>
          {!info.slots.length ? (
            <div className="booking-notice"><Clock3 size={17} aria-hidden="true" /><span><T>{"No times available on this date. Choose another date."}</T></span></div>
          ) : (
            <section className="booking-form-section">
              <h3><T>{"Your details"}</T></h3>
              <p><T>{"Pick a time and tell the shop who is coming."}</T></p>
              <ActionForm action={publicBookingAction} label="Book visit">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="doctorId" value={info.doctor.id} />
                <input type="hidden" name="operationId" value={randomUUID()} />
                <div className="booking-fields">
                  <label>
                    <T>{"Available time"}</T>
                    <select name="startsAt" required>
                      <option value=""><T>{"Choose a time"}</T></option>
                      {info.slots.map((slot) => (
                        <option
                          key={slot.startsAt.toISOString()}
                          value={slot.startsAt.toISOString()}
                        >
                          {new Intl.DateTimeFormat("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(slot.startsAt)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <T>{"Your name"}</T>
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={150}
                    />
                  </label>
                  <label>
                    <T>{"Mobile number"}</T>
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      required
                      maxLength={20}
                    />
                  </label>
                </div>
                <label className="checkbox booking-consent">
                  <input name="confirmed" type="checkbox" required />
                  <T>
                    {
                      "These are my contact details, and the shop may contact me about this appointment."
                    }
                  </T>
                </label>
                <p className="muted booking-privacy">
                  <T>
                    {
                      "No online payment or promotional messages. Contact the shop if you need to change or cancel your visit."
                    }
                  </T>
                </p>
              </ActionForm>
            </section>
          )}
        </>
      )}
        <footer className="booking-safety-note"><ShieldCheck size={16} aria-hidden="true" /><span><T>{"No online payment. Your details are used only to manage this appointment."}</T></span></footer>
      </section>
    </main>
  );
}
