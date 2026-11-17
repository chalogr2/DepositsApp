// SERVER-ONLY: uses the Stripe secret key and the Supabase service-role key.
// Never import this from a "use client" component.
import type Stripe from "stripe";
import { stripePlatform } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Copies a restaurant's platform-subscription state FROM Stripe INTO our
 * `restaurants` row.
 *
 * Used by two callers:
 *  1. The Stripe webhook (`/api/stripe/webhook`), in the background, eventually.
 *  2. The vendor dashboard when the restaurant returns from Checkout
 *     (`/vendor?sub=success&session_id=...`). This runs immediately, so the
 *     page shows the new subscription on the very first render instead of
 *     waiting for the webhook to arrive.
 *
 * It always RE-FETCHES the subscription from Stripe instead of trusting an
 * event payload. Webhooks can arrive late or out of order (e.g. an old
 * "incomplete" event after the newer "active" one); fetching the current
 * state means whichever call runs last still writes the correct value.
 *
 * Running it twice is harmless (idempotent): it just writes the same values.
 */
export async function syncRestaurantSubscription(params: {
  restaurantId: string;
  subscriptionId: string;
  customerId?: string | null;
}): Promise<{ status: string }> {
  const stripe = stripePlatform();
  const sub = await stripe.subscriptions.retrieve(params.subscriptionId);

  const status = normalizeStatus(sub.status);

  // Newer Stripe API versions moved current_period_end onto subscription
  // items; accept either location.
  const periodEnd: number | undefined =
    (sub as any).current_period_end ?? (sub as any).items?.data?.[0]?.current_period_end;

  const { error } = await supabaseAdmin()
    .from("restaurants")
    .update({
      subscription_status: status,
      stripe_subscription_id: sub.id,
      subscription_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      // Only overwrite the customer id when the caller knows it
      ...(params.customerId ? { stripe_customer_id: params.customerId } : {}),
    })
    .eq("id", params.restaurantId);

  if (error) throw new Error(`Supabase update (syncRestaurantSubscription) failed: ${error.message}`);

  return { status };
}

/** Map Stripe's many subscription statuses to the few our app uses. */
function normalizeStatus(s: Stripe.Subscription.Status): string {
  switch (s) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
      return s;
    default:
      // incomplete, incomplete_expired, unpaid, paused
      return "inactive";
  }
}
