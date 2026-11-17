/**
 * Single source of truth for "is this restaurant's platform subscription usable?"
 *
 * Used by BOTH the vendor dashboard (to colour the badge / enable buttons) and
 * the reservation-create API (to enforce the paywall). Keeping one function
 * means the UI and the server can never disagree.
 *
 * Pure functions only (no Supabase / Stripe imports) so it is safe to import
 * from client components.
 */

export type SubscriptionFields = {
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
};

/** Statuses that unlock the app. "trialing" = a free trial on the Stripe price. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Active = status "active" or "trialing" AND the period has not ended yet.
 * (Before, admin counted "trialing" as active but the dashboard and the
 * reservations API didn't, so a trial user saw "en periodo de prueba" yet
 * could not create links.)
 * A missing period end is treated as "no known end" (still active), which
 * matches the previous behaviour.
 */
export function isSubscriptionActive(r: SubscriptionFields, now: Date = new Date()): boolean {
  if (!ACTIVE_STATUSES.has(String(r.subscription_status))) return false;
  if (!r.subscription_current_period_end) return true;
  return new Date(r.subscription_current_period_end).getTime() > now.getTime();
}

/**
 * Human-readable (Spanish) label for the dashboard badge.
 *
 * Important: the DB can say "active" while the period end is in the past
 * (e.g. Stripe never told us the subscription ended). In that case we show
 * "caducada" (expired) instead of the raw DB value, so the badge text always
 * agrees with the badge colour.
 */
export function subscriptionLabel(r: SubscriptionFields, now: Date = new Date()): string {
  const status = String(r.subscription_status ?? "inactive");

  if (ACTIVE_STATUSES.has(status) && !isSubscriptionActive(r, now)) return "caducada";

  switch (status) {
    case "active":
      return "activa";
    case "trialing":
      return "en periodo de prueba";
    case "past_due":
      return "pago pendiente";
    case "canceled":
      return "cancelada";
    case "inactive":
      return "inactiva";
    default:
      return status;
  }
}
