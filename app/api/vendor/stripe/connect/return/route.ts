import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripePlatform, appBaseUrl } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const baseUrl = appBaseUrl();

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(`${baseUrl}/vendor`);

  // read restaurant (scoped to owner)
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, owner_user_id, stripe_account_id")
    .eq("owner_user_id", user.id)
    .single();

  if (!restaurant?.stripe_account_id) {
    return NextResponse.redirect(`${baseUrl}/vendor`);
  }

  const stripe = stripePlatform();
  const acct: any = await stripe.accounts.retrieve(restaurant.stripe_account_id);

  const complete = Boolean(acct?.details_submitted) && Boolean(acct?.charges_enabled);

  // write with admin to avoid RLS issues, but keep scoped
  const admin = supabaseAdmin();
  await admin
    .from("restaurants")
    .update({ stripe_onboarding_complete: complete })
    .eq("id", restaurant.id)
    .eq("owner_user_id", user.id);

  return NextResponse.redirect(`${baseUrl}/vendor`);
}
