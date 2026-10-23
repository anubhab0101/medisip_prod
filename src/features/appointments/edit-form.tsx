"use client";
import { T } from "@/lib/i18n/provider";

import { useState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { editDoctorAction } from "./edit-actions";
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const time = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
type Window = { weekday: number; startMinute: number; endMinute: number };
export function DoctorEditForm({
  doctor,
  accounts,
  canLink,
}: {
  doctor: {
    id: string;
    name: string;
    specialization: string;
    feePaise: number;
    slotMinutes: number;
    active: boolean;
    userId: string | null;
    availability: Window[];
  };
  accounts: { id: string; name: string }[];
  canLink: boolean;
}) {
  const [rows, setRows] = useState(
    doctor.availability.map((w, i) => ({ ...w, key: i })),
  );
  const [next, setNext] = useState(rows.length);
  return (
    <ActionForm action={editDoctorAction} label="Save doctor">
      <input type="hidden" name="id" value={doctor.id} />
      <div className="fields">
        <label>
          <T>{"Name"}</T>
          <input
            name="name"
            defaultValue={doctor.name}
            required
            maxLength={150}
          />
        </label>
        <label>
          <T>{"Specialization"}</T>
          <input
            name="specialization"
            defaultValue={doctor.specialization}
            required
            maxLength={150}
          />
        </label>
        <label>
          <T>{"Fee (₹)"}</T>
          <input
            name="fee"
            defaultValue={(doctor.feePaise / 100).toFixed(2)}
            required
          />
        </label>
        <label>
          <T>{"Slot length (minutes)"}</T>
          <input
            name="slotMinutes"
            type="number"
            min="5"
            max="240"
            defaultValue={doctor.slotMinutes}
            required
          />
        </label>
        {canLink ? (
          <label>
            <T>{"Doctor login"}</T>
            <select name="userId" defaultValue={doctor.userId ?? ""}>
              <option value="">
                <T>{"No linked login"}</T>
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="userId" value={doctor.userId ?? ""} />
        )}
      </div>
      <label className="checkbox">
        <input name="active" type="checkbox" defaultChecked={doctor.active} />
        <T>{"Available for new bookings"}</T>
      </label>
      <h2>
        <T>{"Weekly hours (India time)"}</T>
      </h2>
      {rows.map((w, i) => (
        <div className="fields" key={w.key}>
          <label>
            <T>{"Day "}</T>
            {i + 1}
            <select name="weekday" defaultValue={w.weekday}>
              {days.map((d, i) => (
                <option value={i} key={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            <T>{"Starts"}</T>
            <input
              name="start"
              type="time"
              defaultValue={time(w.startMinute)}
              required
            />
          </label>
          <label>
            <T>{"Ends"}</T>
            <input
              name="end"
              type="time"
              defaultValue={time(w.endMinute)}
              required
            />
          </label>
          {rows.length > 1 && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setRows(rows.filter((r) => r.key !== w.key))}
            >
              <T>{"Remove hours "}</T>
              {i + 1}
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={rows.length >= 28}
        onClick={() => {
          setRows([
            ...rows,
            { key: next, weekday: 1, startMinute: 540, endMinute: 780 },
          ]);
          setNext(next + 1);
        }}
      >
        <T>{"+ Add hours"}</T>
      </button>
      <p>
        <T>
          {
            "Existing bookings are protected. Cancel and rebook any affected appointment before changing its hours."
          }
        </T>
      </p>
    </ActionForm>
  );
}
