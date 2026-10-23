"use client";
import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Channel } from "@prisma/client";
import { shopDate } from "@/lib/date";
import { broadcastBody, doctorAnnouncement } from "./broadcast-content";
import { previewBroadcastAction } from "./broadcast-actions";
export function BroadcastForm({
  customers,
  doctors,
  shopName,
  phone,
}: {
  customers: { id: string; name: string; phone: string }[];
  doctors: { id: string; name: string }[];
  shopName: string;
  phone: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState("DOCTOR");
  const [doctor, setDoctor] = useState(doctors[0]?.name ?? "");
  const [date, setDate] = useState(shopDate());
  const [from, setFrom] = useState("17:00");
  const [to, setTo] = useState("19:00");
  const [bookingUrl, setBookingUrl] = useState("");
  const [custom, setCustom] = useState("");
  const [title, setTitle] = useState("Shop announcement");
  const [channel, setChannel] = useState<Channel>(Channel.SMS);
  const [audience, setAudience] = useState("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef(crypto.randomUUID());
  const body =
    kind === "DOCTOR"
      ? doctorAnnouncement({ doctor, date, from, to, bookingUrl, phone })
      : custom;
  async function preview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (kind === "DOCTOR" && (!doctor || !date || from >= to)) {
      setError("Choose a doctor, date and an end time after the start time.");
      return;
    }
    if (bookingUrl && !/^https:\/\//i.test(bookingUrl)) {
      setError(
        "Use a full HTTPS booking link, or leave it blank to use the shop phone.",
      );
      return;
    }
    setPending(true);
    try {
      const result = await previewBroadcastAction({
        operationId: operation.current,
        channel,
        audience,
        customerIds: selected,
        title: kind === "DOCTOR" ? `${doctor} · ${date}` : title,
        body,
        ...(kind === "DOCTOR"
          ? { expiresAt: new Date(`${date}T${to}:00+05:30`).toISOString() }
          : {}),
      });
      if (result.error) {
        setError(result.error);
        operation.current = crypto.randomUUID();
      } else if (result.id)
        router.push(`/notifications/broadcast/${result.id}`);
    } catch {
      setError("Could not confirm the preview. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="stack" onSubmit={preview}>
      <fieldset disabled={pending}>
        <div className="fields">
          <label>
            <T>{"Announcement"}</T>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="DOCTOR">
                <T>{"Doctor visiting"}</T>
              </option>
              <option value="GENERAL">
                <T>{"Write your own"}</T>
              </option>
            </select>
          </label>
          <label>
            <T>{"Send by"}</T>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="SMS">SMS</option>
              <option value="WHATSAPP">
                <T>{"WhatsApp — send individually"}</T>
              </option>
              <option value="EMAIL">
                <T>{"Email — send individually"}</T>
              </option>
            </select>
          </label>
        </div>
        {kind === "DOCTOR" ? (
          <div className="fields">
            <label>
              <T>{"Doctor"}</T>
              <select
                value={doctor}
                onChange={(e) => setDoctor(e.target.value)}
                required
              >
                <option value="">
                  <T>{"Choose doctor"}</T>
                </option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <T>{"Visit date"}</T>
              <input
                type="date"
                value={date}
                min={shopDate()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label>
              <T>{"From"}</T>
              <input
                type="time"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </label>
            <label>
              <T>{"Until"}</T>
              <input
                type="time"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </label>
            <label>
              <T>{"Booking link (optional)"}</T>
              <LocalizedInput
                type="url"
                placeholder="https://…"
                value={bookingUrl}
                onChange={(e) => setBookingUrl(e.target.value)}
                maxLength={400}
              />
              <small>
                <T>{"Leave blank to invite customers to call "}</T>
                {phone}.
              </small>
            </label>
          </div>
        ) : (
          <>
            <label>
              <T>{"Title"}</T>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={100}
              />
            </label>
            <label>
              <T>{"Message"}</T>
              <textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={1200}
                required
              />
            </label>
          </>
        )}
        <label>
          <T>{"Customers"}</T>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="ALL">
              <T>{"All customers who agreed to this channel"}</T>
            </option>
            <option value="SELECTED">
              <T>{"Choose customers"}</T>
            </option>
          </select>
        </label>
        {audience === "SELECTED" && (
          <div className="panel">
            <label>
              <T>{"Find customer"}</T>
              <LocalizedInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name or phone"
              />
            </label>
            <p>
              {selected.length}
              <T>{" selected"}</T>
            </p>
            <div className="recipient-picker">
              {customers
                .filter((c) =>
                  `${c.name} ${c.phone}`
                    .toLowerCase()
                    .includes(q.toLowerCase()),
                )
                .map((c) => (
                  <label key={c.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, c.id]
                            : selected.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.name} · {c.phone}
                  </label>
                ))}
            </div>
            <small>
              <T>
                {
                  "Search covers up to 1,000 recent customers. “All customers” covers the full shop."
                }
              </T>
            </small>
          </div>
        )}
        <section className="notice">
          <strong>
            <T>{"Message preview"}</T>
          </strong>
          <p className="message-body">{broadcastBody(shopName, body)}</p>
        </section>
        <small>
          <T>
            {
              "Consent is checked before confirmation and again before sending. Announcements are sent between 8 AM and 9 PM. A doctor announcement expires when the visit ends."
            }
          </T>
        </small>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button" disabled={pending}>
        <T>{pending ? "Preparing preview…" : "Review recipients"}</T>
      </button>
    </form>
  );
}
