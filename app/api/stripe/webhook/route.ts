import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripePlatform } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const stripe = stripePlatform();
  const sig = headers().get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json(
      { error: "Missing stripe signature or webhook secret" },
      { status: 400 }
    );
  }

  const rawBody = await req.text();
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Helper: map Stripe subscription -> our normalized status + write to restaurant
  async function applySubscription(sub: any) {
    const status = (sub.status || "inactive") as string;
    const end = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    // Preferred mapping is metadata.restaurant_id (if you set it on the subscription)
    // Fallback: look up restaurant by stripe_subscription_id (when metadata isn't present)
    let restaurantId: string | null = sub.metadata?.restaurant_id ?? null;

    if (!restaurantId && sub.id) {
      const { data: row } = await admin
        .from("restaurants")
        .select("id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();
      restaurantId = row?.id ?? null;
    }

    if (!restaurantId) return;

    const normalized =
      status === "active"
        ? "active"
        : status === "trialing"
        ? "trialing"
        : status === "past_due"
        ? "past_due"
        : status === "canceled"
        ? "canceled"
        : "inactive";

    await admin
      .from("restaurants")
      .update({
        subscription_status: normalized,
        stripe_subscription_id: sub.id,
        subscription_current_period_end: end,
      })
      .eq("id", restaurantId);
  }

  // ✅ NEW: when checkout completes, store stripe_customer_id (+ subscription id)
  // This is required so /api/vendor/billing/subscribe can route to the Customer Portal.
  async function applyCheckoutSession(session: any) {
    if (session.mode !== "subscription") return;

    const restaurantId =
      session?.metadata?.restaurant_id || session.client_reference_id;
    const stripeCustomerId = session.customer as string | null;
    const stripeSubscriptionId = session.subscription as string | null;

    if (!restaurantId) return;

    // Save customer/subscription IDs (even if subscription isn't retrieved yet)
    await admin
      .from("restaurants")
      .update({
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      })
      .eq("id", restaurantId);

    // If we have a subscription ID, retrieve and update status/period end too
    if (stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      await applySubscription(sub);
    }
  }

  // Handle events
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    await applyCheckoutSession(session);
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await applySubscription(event.data.object);
  }

  return NextResponse.json({ received: true });
}