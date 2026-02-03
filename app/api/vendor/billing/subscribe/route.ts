import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const supabase = supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: restaurant, error: e1 } = await supabase
    .from("restaurants")
    .select("id, stripe_customer_id")
    .eq("owner_user_id", user.id)
    .single();

  if (e1 || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const stripe = new Stripe(process.env.STRIPE_PLATFORM_SECRET_KEY!, {
    apiVersion: "2024-06-20",
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const returnUrl = `${appUrl}/vendor`;

  // ✅ If we already have a Stripe Customer, go to Customer Portal (manage/cancel)
  if (restaurant.stripe_customer_id) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: restaurant.stripe_customer_id,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: portal.url });
  }

  // ✅ Otherwise, create a NEW subscription checkout
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_SUB_PRICE_ID!, quantity: 1 }],
    success_url: `${returnUrl}?sub=success`,
    cancel_url: `${returnUrl}?sub=cancel`,

    // Link back to your restaurant row for the webhook
    client_reference_id: restaurant.id,
    metadata: { restaurant_id: restaurant.id },

    // Optional, but can help if you want the customer created with this email:
    customer_email: user.email ?? undefined,
  });

  return NextResponse.json({ url: session.url });
}