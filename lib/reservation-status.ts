/**
 * Single source of truth for a reservation's lifecycle: which statuses exist,
 * how they are labelled, and which actions the restaurant may take on each.
 *
 * Used by the dashboard (which buttons to show), the guest page (what to tell
 * the guest) and the status API route (what to allow). Same idea as
 * lib/subscription.ts: one function, so the UI and the server cannot disagree.
 *
 * Pure functions only: safe to import from client components.
 *
 *   PENDING ──pay──▶ PAID ──▶ ATTENDED   (deposit applied to the bill)
 *      │               │ ╲
 *      │               │  ▶ NO_SHOW      (restaurant keeps the deposit)
 *      │               ▼
 *      ├──cancel──▶ CANCELED             (if paid: full refund via Stripe)
 *      └──time passes unpaid──▶ EXPIRED
 */

export type ReservationStatus = "PENDING" | "PAID" | "CANCELED" | "EXPIRED" | "NO_SHOW" | "ATTENDED";
export type ReservationAction = "cancel" | "no_show" | "attended";

export type ReservationLike = {
  status?: string | null;
  datetime_iso?: string | null;
  refunded_at?: string | null;
};

/** Status each action moves the reservation to. */
export const ACTION_TARGET: Record<ReservationAction, ReservationStatus> = {
  cancel: "CANCELED",
  no_show: "NO_SHOW",
  attended: "ATTENDED",
};

/** Statuses in which the guest's deposit has been paid (and not refunded by cancel). */
export const PAID_STATUSES: ReadonlySet<string> = new Set(["PAID", "NO_SHOW", "ATTENDED"]);

export function hasReservationTimePassed(r: ReservationLike, now: Date = new Date()): boolean {
  const t = Date.parse(String(r.datetime_iso ?? ""));
  return !Number.isNaN(t) && t <= now.getTime();
}

/**
 * The status to SHOW and to reason with. A PENDING reservation whose time has
 * passed is EXPIRED even if the database hasn't been updated yet. There's no
 * background job: the server writes EXPIRED lazily the next time it touches
 * the row (see expireOverdue* in lib/reservation-lifecycle.ts). This keeps the
 * UI correct in between, e.g. on a dashboard left open past the reservation
 * time.
 */
export function effectiveStatus(r: ReservationLike, now: Date = new Date()): ReservationStatus | string {
  const s = String(r.status ?? "").toUpperCase();
  if (s === "PENDING" && hasReservationTimePassed(r, now)) return "EXPIRED";
  return s;
}

/**
 * Actions the restaurant may take right now.
 *  - Cancel: unpaid link stops working; paid deposit is fully refunded.
 *    Allowed from NO_SHOW too (restaurant changes its mind and refunds).
 *  - No-show and Attended: only once the reservation time has passed. Before
 *    that, neither has happened yet. (First version allowed "Attended" early
 *    for guests arriving early; the owner ruled that out.)
 *  - NO_SHOW <-> ATTENDED can be switched, to undo a mis-click.
 */
export function allowedActions(r: ReservationLike, now: Date = new Date()): ReservationAction[] {
  const passed = hasReservationTimePassed(r, now);
  switch (effectiveStatus(r, now)) {
    case "PENDING":
      return ["cancel"];
    case "PAID":
      return passed ? ["attended", "no_show", "cancel"] : ["cancel"];
    // NO_SHOW / ATTENDED can only exist after the time has passed, but check
    // anyway: the rule shouldn't depend on how the row got its status.
    case "NO_SHOW":
      return passed ? ["attended", "cancel"] : ["cancel"];
    case "ATTENDED":
      return passed ? ["no_show"] : [];
    default:
      return []; // CANCELED and EXPIRED are final
  }
}

export function statusLabel(r: ReservationLike, now: Date = new Date()): string {
  const s = effectiveStatus(r, now);
  const base =
    {
      PENDING: "⏳ PENDIENTE",
      PAID: "✅ PAGADO",
      CANCELED: "✖ CANCELADA",
      EXPIRED: "⌛ EXPIRADA",
      NO_SHOW: "🚫 NO PRESENTADO",
      ATTENDED: "🍽️ ASISTIÓ",
    }[s] ?? (s || "—");
  return r.refunded_at ? `${base} · reembolsado` : base;
}

/** Green badge: the restaurant has (or had, and used) the money. */
export function isPositiveStatus(r: ReservationLike, now: Date = new Date()): boolean {
  return PAID_STATUSES.has(effectiveStatus(r, now)) && !r.refunded_at;
}

export const ACTION_LABEL: Record<ReservationAction, string> = {
  attended: "Asistió",
  no_show: "No presentado",
  cancel: "Cancelar",
};
