import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripePlatform } from "@/lib/stripe";
import { markReservationPaidFromSession } from "@/lib/reservation-payments";

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
 *  - Events: checkout.session.completed, checkout.session.async_payment_succeeded
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
