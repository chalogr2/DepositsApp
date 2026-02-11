import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripePlatform } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs"; // ✅ important for Stripe signature verification on Vercel
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
    return NextResponse.json({ error: e?.message ?? "Invalid signature" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Helper: map Stripe subscription -> our normalized status + write to restaurant
  async function applySubscription(sub: any) {
    const status = String(sub?.status ?? "inactive");
    const end = sub?.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    // Preferred mapping: metadata.restaurant_id (if present)
    // Fallback: look up by stripe_subscription_id
    let restaurantId: string | null = sub?.metadata?.restaurant_id ?? null;

    if (!restaurantId && sub?.id) {
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

    const { error } = await admin
      .from("restaurants")
      .update({
        subscription_status: normalized,
        stripe_subscription_id: sub?.id ?? null,
        subscription_current_period_end: end,
      })
      .eq("id", restaurantId);

    if (error) throw new Error(`Supabase update (applySubscription) failed: ${error.message}`);
  }

  // When checkout completes, store stripe_customer_id (+ subscription id), then sync subscription status
  async function applyCheckoutSession(session: any) {
    if (session?.mode !== "subscription") return;

    const restaurantId: string | null =
      session?.metadata?.restaurant_id || session?.client_reference_id || null;

    if (!restaurantId) return;

    const stripeCustomerId = (session?.customer as string) || null;
    const stripeSubscriptionId = (session?.subscription as string) || null;

    const { error } = await admin
      .from("restaurants")
      .update({
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      })
      .eq("id", restaurantId);

    if (error) throw new Error(`Supabase update (applyCheckoutSession) failed: ${error.message}`);

    if (stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      await applySubscription(sub);
    }
  }

  try {
    // ✅ checkout completion (subscription purchase)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      await applyCheckoutSession(session);
    }

    // ✅ keep subscription status in sync (include CREATED as well)
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await applySubscription(event.data.object);
    }
  } catch (e: any) {
    // Return 500 so Stripe marks delivery failed and retries (good for production reliability)
    return NextResponse.json(
      { error: e?.message ?? "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
