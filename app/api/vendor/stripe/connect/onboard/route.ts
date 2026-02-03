import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { stripePlatform, appBaseUrl } from "@/lib/stripe";

export async function POST() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { data: restaurant } = await supabase.from("restaurants").select("*").eq("owner_user_id", user.id).single();
  if (!restaurant) return NextResponse.json({ error: "Restaurant profile missing" }, { status: 404 });

  const stripe = stripePlatform();
  const baseUrl = appBaseUrl();

  let acctId = restaurant.stripe_account_id as string | null;
  if (!acctId) {
    const country = process.env.DEFAULT_VENDOR_COUNTRY || "ES";
    const acct = await stripe.accounts.create({ type: "standard", country });
    acctId = acct.id;
    const { error } = await supabase.from("restaurants").update({ stripe_account_id: acctId, stripe_onboarding_complete: false }).eq("id", restaurant.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const link = await stripe.accountLinks.create({
    account: acctId,
    refresh_url: `${baseUrl}/vendor`,
    return_url: `${baseUrl}/api/vendor/stripe/connect/return`,
    type: "account_onboarding"
  });

  return NextResponse.json({ url: link.url });
}
