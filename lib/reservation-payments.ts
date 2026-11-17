// SERVER-ONLY: uses the Supabase service-role key. Never import from a "use client" file.
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type MarkPaidResult =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; httpStatus: number; reason: string };

/**
 * The ONLY place where a reservation becomes PAID.
 *
 * Called from two independent paths that both may run for the same payment:
 *   1. `/api/guest/verify` when the guest's browser reaches `/success`
 *   2. `/api/stripe/connect-webhook` when Stripe notifies us (works even if the
 *      guest closed the tab)
 * It is idempotent: whichever runs second sees PAID and returns alreadyPaid.
 *
 * It never trusts which reservation the CALLER says was paid. It derives
 * everything from the Stripe session and cross-checks it against our DB:
 *   a) the session is a completed, paid, one-off payment;
 *   b) session.metadata.reservation_id names the reservation
 *      (set by us in /api/guest/checkout) and, if the caller passed an
 *      expected id (the `rid` from the URL), they must match;
 *   c) the session lives on the connected account of THAT reservation's
 *      restaurant;
 *   d) the amount and currency equal the reservation's deposit.
 *
 * @param session            Checkout Session as returned by Stripe
 * @param connectedAccountId Stripe account the session was retrieved from / the event came from
 * @param expectedReservationId optional id the caller expects (URL `rid`)
 */
export async function markReservationPaidFromSession(
  session: Stripe.Checkout.Session,
  connectedAccountId: string,
  expectedReservationId?: string
): Promise<MarkPaidResult> {
  // (a) completed + actually paid
  if (session.mode !== "payment") return fail(409, "Not a deposit payment session");
  if (session.payment_status !== "paid") return fail(409, "Payment not completed");

  // (b) which reservation this payment is for, according to Stripe
  const reservationId = session.metadata?.reservation_id;
  if (!reservationId) return fail(409, "Session has no reservation_id");
  if (expectedReservationId && expectedReservationId !== reservationId) {
    // e.g. paying a €1 reservation, then calling verify with another rid
    return fail(409, "Session does not belong to this reservation");
  }

  const admin = supabaseAdmin();

  const { data: reservation } = await admin
    .from("reservations")
    .select("id, restaurant_id, status, deposit_cents")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) return fail(404, "Reservation not found");

  // (c) the session must come from this restaurant's own Stripe account
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("stripe_account_id")
    .eq("id", reservation.restaurant_id)
    .maybeSingle();
  if (!restaurant?.stripe_account_id || restaurant.stripe_account_id !== connectedAccountId) {
    return fail(409, "Session is not from this restaurant's Stripe account");
  }

  // (d) right amount, right currency
  if (session.amount_total !== reservation.deposit_cents || session.currency !== "eur") {
    return fail(409, "Paid amount does not match the deposit");
  }

  if (String(reservation.status).toUpperCase() === "PAID") return { ok: true, alreadyPaid: true };

  // Conditional update: only PENDING -> PAID. If two calls race, the second
  // one matches zero rows instead of overwriting anything.
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  const { data: updated, error } = await admin
    .from("reservations")
    .update({
      status: "PAID",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      stripe_checkout_session_id: session.id,
    })
    .eq("id", reservation.id)
    .eq("status", "PENDING")
    .select("id");

  if (error) throw new Error(`Supabase update (markReservationPaid) failed: ${error.message}`);

  if (!updated?.length) {
    // Not PENDING any more: either the parallel call just set PAID (fine), or
    // it was CANCELED/EXPIRED and was paid anyway (needs a manual refund).
    const { data: now } = await admin.from("reservations").select("status").eq("id", reservation.id).single();
    if (String(now?.status).toUpperCase() === "PAID") return { ok: true, alreadyPaid: true };
    return fail(409, `Reservation is ${now?.status}; payment ${paymentIntentId} needs manual review`);
  }

  return { ok: true, alreadyPaid: false };
}

function fail(httpStatus: number, reason: string): MarkPaidResult {
  return { ok: false, httpStatus, reason };
}
