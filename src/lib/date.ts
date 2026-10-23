export function shopDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function financialYear(now = new Date()) {
  const date = shopDate(now);
  const year =
    Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);
  return `${year}-${String(year + 1).slice(-2)}`;
}
export function expiryFromMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Enter an expiry month");
  const [year, m] = month.split("-").map(Number);
  if (year < 2000 || year > 2200) throw new Error("Invalid expiry year");
  return new Date(Date.UTC(year, m, 0));
}
export function dayStart(now = new Date()) {
  return new Date(`${shopDate(now)}T00:00:00+05:30`);
}
