import { shopDate } from "@/lib/date";
export type Availability = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};
export function slotsForDay(
  date: string,
  availability: Availability[],
  slotMinutes: number,
  now = new Date(),
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(slotMinutes) ||
    slotMinutes < 5 ||
    slotMinutes > 240
  )
    throw new Error("Invalid slot configuration");
  const day = new Date(`${date}T00:00:00+05:30`);
  if (!Number.isFinite(day.getTime()) || shopDate(day) !== date)
    throw new Error("Invalid date");
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const result: { startsAt: Date; endsAt: Date }[] = [];
  for (const window of availability.filter((a) => a.weekday === weekday)) {
    if (
      !Number.isInteger(window.startMinute) ||
      !Number.isInteger(window.endMinute) ||
      window.startMinute < 0 ||
      window.endMinute > 1440 ||
      window.endMinute <= window.startMinute
    )
      throw new Error("Invalid availability");
    for (
      let minute = window.startMinute;
      minute + slotMinutes <= window.endMinute;
      minute += slotMinutes
    ) {
      const startsAt = new Date(day.getTime() + minute * 60000);
      if (startsAt <= now) continue;
      const endsAt = new Date(startsAt.getTime() + slotMinutes * 60000);
      if (!result.some((s) => s.startsAt.getTime() === startsAt.getTime()))
        result.push({ startsAt, endsAt });
    }
  }
  return result.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
export function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
) {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}
