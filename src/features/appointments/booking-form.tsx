"use client";
import { T } from "@/lib/i18n/provider";

import { useEffect, useRef, useState } from "react";
import { availableSlots, bookingAction } from "./actions";
import { shopDate } from "@/lib/date";
export function BookingForm({
  doctors,
  customers,
}: {
  doctors: { id: string; name: string }[];
  customers: { id: string; name: string; phone: string }[];
}) {
  const [doctorId, setDoctor] = useState(doctors[0]?.id ?? "");
  const [date, setDate] = useState(shopDate());
  const [slots, setSlots] = useState<{ startsAt: string; label: string }[]>([]);
  const [startsAt, setStart] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const operation = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    setStart("");
    setSlots([]);
    if (!doctorId) return;
    setLoading(true);
    availableSlots({ doctorId, date })
      .then((slots) => {
        if (active) setSlots(slots);
      })
      .catch(() => {
        if (active) setError("Could not load slots. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [doctorId, date, success]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await bookingAction({
        operationId: operation.current,
        doctorId,
        startsAt,
        customerId: form.get("customerId"),
        notes: form.get("notes"),
      });
      if (result.error) setError(result.error);
      else {
        setSuccess(result.success ?? "Booked.");
        operation.current = crypto.randomUUID();
      }
    } catch {
      setError("Couldn’t confirm the appointment. Try again.");
    } finally {
      setPending(false);
    }
  }
  if (!doctors.length || !customers.length)
    return (
      <p>
        <T>{"Add a doctor and a customer before booking."}</T>
      </p>
    );
  return (
    <form onSubmit={submit} className="stack">
      <div className="fields">
        <label>
          <T>{"Doctor"}</T>
          <select value={doctorId} onChange={(e) => setDoctor(e.target.value)}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T>{"Date"}</T>
          <input
            type="date"
            value={date}
            min={shopDate()}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          <T>{"Customer"}</T>
          <select name="customerId">
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.phone}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T>{"Available time"}</T>
          <select
            value={startsAt}
            onChange={(e) => setStart(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">
              <T>{loading ? "Loading…" : "Choose a time"}</T>
            </option>
            {slots.map((s) => (
              <option key={s.startsAt} value={s.startsAt}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T>{"Notes (optional)"}</T>
          <input name="notes" maxLength={1000} />
        </label>
      </div>
      {!loading && !slots.length && (
        <p>
          <T>{"No free slots on this date."}</T>
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="success">
          {success}
        </p>
      )}
      <button className="button" disabled={pending || !startsAt}>
        <T>{pending ? "Booking…" : "Book appointment"}</T>
      </button>
    </form>
  );
}
