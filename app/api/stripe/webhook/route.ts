import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripePlatform } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncRestaurantSubscription } from "@/lib/billing-sync";

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

  // customer.subscription.* events: find which restaurant, then sync from Stripe.
  // We pass only the IDs on; syncRestaurantSubscription() re-fetches the
  // CURRENT subscription, so a late/out-of-order event can't overwrite a newer
  // state (e.g. an old "incomplete" arriving after "active").
  async function applySubscription(sub: any) {
    if (!sub?.id) return;

    // Preferred mapping: metadata.restaurant_id (set via subscription_data.metadata)
    // Fallback: look up by stripe_subscription_id (older subscriptions)
    let restaurantId: string | null = sub?.metadata?.restaurant_id ?? null;

    if (!restaurantId) {
      const { data: row } = await admin
        .from("restaurants")
        .select("id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();
      restaurantId = row?.id ?? null;
    }

    if (!restaurantId) return;

    await syncRestaurantSubscription({
      restaurantId,
      subscriptionId: sub.id,
      customerId: typeof sub.customer === "string" ? sub.customer : null,
    });
  }

  // checkout.session.completed (subscription mode): store customer + sync subscription
  async function applyCheckoutSession(session: any) {
    if (session?.mode !== "subscription") return;

    const restaurantId: string | null =
      session?.metadata?.restaurant_id || session?.client_reference_id || null;
    const subscriptionId = (session?.subscription as string) || null;

    if (!restaurantId || !subscriptionId) return;

    await syncRestaurantSubscription({
      restaurantId,
      subscriptionId,
      customerId: (session?.customer as string) || null,
    });
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
