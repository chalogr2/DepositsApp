import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST() {
  const supabase = supabaseServer();

  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: restaurant, error: e1 } = await supabase
    .from("restaurants")
    .select("stripe_account_id")
    .eq("owner_user_id", user.id)
    .single();

  if (e1 || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  if (!restaurant.stripe_account_id) {
    return NextResponse.json({ error: "Stripe not connected yet" }, { status: 400 });
  }

  const acct = restaurant.stripe_account_id;

  // Standard accounts: you cannot generate a login link. Send them to Stripe Dashboard.
  return NextResponse.json({
    url: "https://dashboard.stripe.com/",
    deep_link: `https://dashboard.stripe.com/${acct}`,
    stripe_account_id: acct,
  });
}