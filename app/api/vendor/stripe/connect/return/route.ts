import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { stripePlatform, appBaseUrl } from "@/lib/stripe";

export async function GET() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${appBaseUrl()}/vendor`);

  const { data: restaurant } = await supabase.from("restaurants").select("*").eq("owner_user_id", user.id).single();
  if (!restaurant?.stripe_account_id) return NextResponse.redirect(`${appBaseUrl()}/vendor`);

  const stripe = stripePlatform();
  const acct = await stripe.accounts.retrieve(restaurant.stripe_account_id);
  const complete = Boolean((acct as any).details_submitted) && Boolean((acct as any).charges_enabled);

  await supabase.from("restaurants").update({ stripe_onboarding_complete: complete }).eq("id", restaurant.id);
  return NextResponse.redirect(`${appBaseUrl()}/vendor`);
}
