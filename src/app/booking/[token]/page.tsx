import { T } from "@/lib/i18n/provider";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { publicBookingInfo } from "@/features/public-booking/service";
import { publicBookingAction } from "@/features/public-booking/actions";
import { ActionForm } from "@/components/shared/action-form";
import { shopDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
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
      <main className="app-main">
        <h1>
          <T>{"Choose a valid booking date"}</T>
        </h1>
        <p>
          <T>
            {
              "Open the original booking link and choose a date within the next 30 days."
            }
          </T>
        </p>
      </main>
    );
  }
  if (!info)
    return (
      <main className="app-main">
        <h1>
          <T>{"Booking link unavailable"}</T>
        </h1>
        <p>
          <T>{"Contact the shop for an updated booking link."}</T>
        </p>
      </main>
    );
  return (
    <main
      className="app-main"
      style={{ maxWidth: 620, margin: "0 auto", padding: 20 }}
    >
      <h1>{info.shop.name}</h1>
      <p>
        {info.shop.address}
        <br />
        {info.shop.phone}
      </p>
      <h2>
        <T>{"Book a doctor visit"}</T>
      </h2>
      <p>
        <T>
          {
            "Choose a time, then enter your contact details. All times are India time."
          }
        </T>
      </p>
      {!info.doctor ? (
        <p>
          <T>
            {
              "No doctors are available for online booking. Please contact the shop."
            }
          </T>
        </p>
      ) : (
        <>
          <form className="toolbar">
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
            <button className="button secondary">
              <T>{"Show times"}</T>
            </button>
          </form>
          <p>
            {info.doctor.name}
            <T>{" · Visit fee: "}</T>
            {formatMoney(info.doctor.feePaise)}
            <T>{". Pay at the shop."}</T>
          </p>
          {!info.slots.length ? (
            <p>
              <T>{"No times available on this date. Choose another date."}</T>
            </p>
          ) : (
            <section className="panel">
              <ActionForm action={publicBookingAction} label="Book visit">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="doctorId" value={info.doctor.id} />
                <input type="hidden" name="operationId" value={randomUUID()} />
                <div className="fields">
                  <label>
                    <T>{"Time"}</T>
                    <select name="startsAt" required>
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
                <label className="checkbox">
                  <input name="confirmed" type="checkbox" required />
                  <T>
                    {
                      "These are my contact details, and the shop may contact me about this appointment."
                    }
                  </T>
                </label>
                <p className="muted">
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
    </main>
  );
}
