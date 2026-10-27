import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission, can } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { shopDate } from "@/lib/date";
import { ActionForm } from "@/components/shared/action-form";
import { PageTitle, Empty } from "@/components/shared/page";
import { doctorAction, statusAction } from "@/features/appointments/actions";
import { BookingForm } from "@/features/appointments/booking-form";
import { ChevronLeft, ChevronRight, CalendarDays, Clock3 } from "lucide-react";
export default async function Appointments({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context();
  if (
    !can(ctx.role, Permission.APPOINTMENT) &&
    !can(ctx.role, Permission.DOCTOR_OWN)
  )
    throw new BusinessError("You do not have access to appointments.");
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? params.date!
    : shopDate();
  const start = new Date(`${date}T00:00:00+05:30`);
  const week = params.view === "week";
  const shiftDate = (offset: number) => {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + offset))
      .toISOString()
      .slice(0, 10);
  };
  const viewQuery = week ? "view=week" : "view=day";
  const end = new Date(start.getTime() + (week ? 7 : 1) * 86400000);
  const doctors = await db().doctor.findMany({
    where: {
      branchId: ctx.branch.id,
      active: true,
      ...(ctx.role === "DOCTOR" ? { userId: ctx.user.id } : {}),
    },
    orderBy: { name: "asc" },
  });
  const doctorIds = doctors.map((d) => d.id);
  const [appointments, customers] = await Promise.all([
    db().appointment.findMany({
      where: {
        branchId: ctx.branch.id,
        doctorId: { in: doctorIds },
        startsAt: { gte: start, lt: end },
      },
      include: { doctor: true },
      orderBy: { startsAt: "asc" },
    }),
    can(ctx.role, Permission.APPOINTMENT)
      ? db().customer.findMany({
          where: { branchId: ctx.branch.id, active: true },
          select: { id: true, name: true, phone: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const patients =
    ctx.role === "DOCTOR"
      ? await db().customer.findMany({
          where: {
            branchId: ctx.branch.id,
            id: { in: appointments.map((a) => a.customerId) },
          },
          select: { id: true, name: true },
        })
      : customers;
  return (
    <>
      <PageTitle
        title="Appointments"
        description="Book a visit, see who is coming, and update each appointment."
      />
      <div className="appointment-shortcuts">
        {ctx.role === "OWNER" && (
          <Link className="button secondary" href="/appointments/booking-link">
            <T>Public booking link</T>
          </Link>
        )}
        {can(ctx.role, Permission.APPOINTMENT) && (
          <Link className="button secondary" href="/appointments/doctors">
            <T>{"Doctors & hours"}</T>
          </Link>
        )}
      </div>
      {can(ctx.role, Permission.APPOINTMENT) && (
        <>
          <section className="panel appointment-booking-card" id="appointment-booking">
            <div className="appointment-section-heading">
              <div className="appointment-heading-icon"><CalendarDays size={18} aria-hidden="true" /></div>
              <div><h2><T>{"Book appointment"}</T></h2><p><T>{"Choose the doctor, customer and an available time."}</T></p></div>
            </div>
            <BookingForm doctors={doctors} customers={customers} />
          </section>
          <details className="panel disclosure appointment-add-doctor">
            <summary>
              <T>{"+ Add doctor"}</T>
            </summary>
            <ActionForm action={doctorAction} label="Add doctor">
              <div className="fields">
                <label>
                  <T>{"Name"}</T>
                  <input name="name" required />
                </label>
                <label>
                  <T>{"Specialization"}</T>
                  <input
                    name="specialization"
                    defaultValue="General"
                    required
                  />
                </label>
                <label>
                  <T>{"Fee (₹)"}</T>
                  <input
                    name="fee"
                    defaultValue="0"
                    required
                    inputMode="decimal"
                  />
                </label>
                <label>
                  <T>{"Slot length (minutes)"}</T>
                  <input
                    name="slotMinutes"
                    type="number"
                    min="5"
                    max="240"
                    defaultValue="15"
                    required
                  />
                </label>
                <label>
                  <T>{"Available day"}</T>
                  <select name="weekday">
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((day, i) => (
                      <option key={day} value={i}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <T>{"Start time"}</T>
                  <input
                    name="start"
                    type="time"
                    defaultValue="09:00"
                    required
                  />
                </label>
                <label>
                  <T>{"End time"}</T>
                  <input name="end" type="time" defaultValue="13:00" required />
                </label>
              </div>
            </ActionForm>
          </details>
        </>
      )}
      <section className="panel appointment-schedule">
        <div className="appointment-schedule-heading">
          <div className="appointment-section-heading">
            <div className="appointment-heading-icon"><Clock3 size={18} aria-hidden="true" /></div>
            <div><h2><T>{"Schedule"}</T></h2><p><T>{"Appointments for "}</T>{date}</p></div>
          </div>
          <div className="appointment-date-nav">
            <Link className="button secondary appointment-arrow" href={`/appointments?date=${shiftDate(week ? -7 : -1)}&${viewQuery}`} aria-label="Previous period"><ChevronLeft size={18} /></Link>
            <Link className="button secondary appointment-today" href={`/appointments?date=${shopDate()}&view=day`}><T>{"Today"}</T></Link>
            <Link className="button secondary appointment-arrow" href={`/appointments?date=${shiftDate(week ? 7 : 1)}&${viewQuery}`} aria-label="Next period"><ChevronRight size={18} /></Link>
          </div>
        </div>
        <form className="toolbar appointment-filters">
          <label>
            <T>{"Date"}</T>
            <input name="date" type="date" defaultValue={date} />
          </label>
          <label>
            <T>{"View"}</T>
            <select name="view" defaultValue={week ? "week" : "day"}>
              <option value="day"><T>{"Day"}</T></option>
              <option value="week"><T>{"7 days"}</T></option>
            </select>
          </label>
          <button className="button secondary"><T>{"Show"}</T></button>
        </form>
      {!appointments.length ? (
        <Empty><T>{"No appointments on this date."}</T></Empty>
      ) : (
        <div className="table-wrap">
          <table className="appointments-table">
            <thead>
              <tr>
                <th>
                  <T>{"Time"}</T>
                </th>
                <th>
                  <T>{"Customer"}</T>
                </th>
                <th>
                  <T>{"Doctor"}</T>
                </th>
                <th>
                  <T>{"Status"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td data-label="Time">
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata",
                      weekday: week ? "short" : undefined,
                      day: week ? "numeric" : undefined,
                      month: week ? "short" : undefined,
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(a.startsAt)}
                  </td>
                  <td data-label="Customer">
                    {patients.find((c) => c.id === a.customerId)?.name ??
                      "Archived customer"}
                  </td>
                  <td data-label="Doctor">{a.doctor.name}</td>
                  <td data-label="Status" className="appointment-status-cell">
                    {can(ctx.role, Permission.APPOINTMENT) ? (
                      <ActionForm action={statusAction} label="Update">
                        <input type="hidden" name="id" value={a.id} />
                        <label>
                          <span className="sr-only">
                            <T>{"Status"}</T>
                          </span>
                          <select name="status" defaultValue={a.status}>
                            {[
                              "BOOKED",
                              "CONFIRMED",
                              "COMPLETED",
                              "CANCELLED",
                              "NO_SHOW",
                            ].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </label>
                      </ActionForm>
                    ) : (
                      a.status
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </section>
    </>
  );
}
