import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripePlatform } from "@/lib/stripe";
import { markReservationPaidFromSession } from "@/lib/reservation-payments";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs"; // raw body + crypto for signature verification
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Webhook for events that happen ON RESTAURANTS' CONNECTED ACCOUNTS
 * (guest deposit payments). Separate from /api/stripe/webhook, which handles
 * events on OUR platform account (subscriptions).
 *
 * Why it exists: before, a reservation only became PAID if the guest's browser
 * reached /success. If they closed the tab after paying, it stayed PENDING
 * forever. Stripe now tells us directly.
 *
 * Setup
 *  - Local:  stripe listen --forward-to localhost:3000/api/stripe/webhook \
 *                          --forward-connect-to localhost:3000/api/stripe/connect-webhook
 *            (the CLI signs both with the same whsec, so STRIPE_WEBHOOK_SECRET works)
 *  - Production: Stripe Dashboard → Webhooks → add endpoint → "Events on
 *    Connected accounts" → this URL. It has its OWN signing secret:
 *    put it in STRIPE_CONNECT_WEBHOOK_SECRET.
 *  - Events: checkout.session.completed, checkout.session.async_payment_succeeded,
 *    charge.refunded (refunds made directly in the restaurant's Stripe Dashboard)
 */
export async function POST(req: Request) {
  const sig = headers().get("stripe-signature");
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing stripe signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // Must be the RAW body: signature is computed over the exact bytes
    event = stripePlatform().webhooks.constructEvent(await req.text(), sig, secret);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Invalid signature" }, { status: 400 });
  }

  // Refund done outside our app (restaurant's Stripe Dashboard): record it.
  if (event.type === "charge.refunded" && event.account) {
    try {
      await recordExternalRefund(event.data.object as Stripe.Charge);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "Webhook handler failed" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  const isPaymentEvent =
    event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";

  // `event.account` is set only for Connect events (the restaurant's acct_...)
  if (!isPaymentEvent || !event.account) return NextResponse.json({ received: true });

  const session = event.data.object as Stripe.Checkout.Session;

  // Card payments are "paid" at completed. Delayed methods (e.g. SEPA) are
  // "unpaid" at completed and send async_payment_succeeded later.
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  try {
    const result = await markReservationPaidFromSession(session, event.account);
    if (!result.ok) {
      // A business-rule rejection will not fix itself on retry, so answer 200
      // (stop retries) and log it for a human to look at.
      console.warn(`[connect-webhook] ${event.id}: not marked paid: ${result.reason}`);
    }
  } catch (e: any) {
    // Infrastructure error (DB down...): 500 so Stripe retries later
    return NextResponse.json({ error: e?.message ?? "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * charge.refunded also fires for refunds made by OUR cancel button. Running
 * twice is harmless: refunded_at is only set if empty, and the status change
 * is conditional.
 * Only FULL refunds count (charge.refunded === true). A partial refund (e.g.
 * restaurant keeps part of the deposit) leaves the reservation as it is.
 */
async function recordExternalRefund(charge: Stripe.Charge) {
  if (!charge.refunded) return;
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  // Paid-but-not-yet-served reservations become CANCELED...
  const r1 = await admin
    .from("reservations")
    .update({ status: "CANCELED", refunded_at: now })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .in("status", ["PAID", "NO_SHOW"]);
  if (r1.error) throw new Error(r1.error.message);

  // ...any other status (e.g. ATTENDED, refunded as a goodwill gesture) keeps
  // its status and just gets the refund date, shown as "· reembolsado".
  const r2 = await admin
    .from("reservations")
    .update({ refunded_at: now })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .is("refunded_at", null);
  if (r2.error) throw new Error(r2.error.message);
}
