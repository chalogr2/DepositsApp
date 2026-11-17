import { APP_TIMEZONE } from "./config";

/**
 * Reservation times are STORED as UTC ISO strings ("2026-11-18T19:30:00.000Z")
 * and DISPLAYED in the restaurant's timezone (APP_TIMEZONE, Europe/Madrid).
 *
 * Why the explicit timeZone: without it, formatting uses the timezone of
 * whatever machine runs the code. On the server (Vercel = UTC) that is one
 * hour off for Spain in winter, two in summer. A fixed locale + timezone gives
 * the same text on the server and in any browser.
 *
 * Safe to import from client components (no server dependencies).
 */
const LONG = new Intl.DateTimeFormat("es-ES", {
  timeZone: APP_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}); // "miércoles, 18 de noviembre de 2026, 20:30"

const SHORT = new Intl.DateTimeFormat("es-ES", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}); // "18/11/2026, 20:30"

export function formatReservationDate(iso: string, style: "long" | "short" = "long"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—"; // never crash on legacy/bad data
  return (style === "long" ? LONG : SHORT).format(d);
}

/**
 * Value for an <input type="datetime-local">, which expects LOCAL wall-clock
 * time "YYYY-MM-DDTHH:mm" with no timezone. `toISOString().slice(0, 16)` is a
 * common bug: it gives UTC wall-clock time, so the field shows 1–2 h early.
 */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
