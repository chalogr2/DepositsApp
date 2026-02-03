import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST() {
  const supabase = supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("stripe_customer_id")
    .eq("owner_user_id", user.id)
    .single();

  if (error || !restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  if (!restaurant.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer yet. Subscribe first." }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_PLATFORM_SECRET_KEY!, { apiVersion: "2024-06-20" });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer: restaurant.stripe_customer_id,
    return_url: `${appUrl}/vendor`,
  });

  return NextResponse.json({ url: session.url });
}