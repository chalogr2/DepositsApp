import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { stripePlatform } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const supabase = supabaseServer();

  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .select("stripe_account_id")
    .eq("owner_user_id", user.id)
    .single();

  if (rErr || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  if (!restaurant.stripe_account_id) {
    return NextResponse.json({ error: "Stripe not connected yet" }, { status: 400 });
  }

  const stripe = stripePlatform();

  // Express accounts: generate an Express Dashboard login link
  const login = await stripe.accounts.createLoginLink(restaurant.stripe_account_id);

  return NextResponse.json({ url: login.url });
}
