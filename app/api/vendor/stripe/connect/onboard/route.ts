import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripePlatform, appBaseUrl } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 });
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  // Read restaurant (scoped to owner)
  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .select("id, owner_user_id, stripe_account_id, stripe_onboarding_complete")
    .eq("owner_user_id", user.id)
    .single();

  if (rErr || !restaurant) {
    return NextResponse.json({ error: "Restaurant profile missing" }, { status: 404 });
  }

  const stripe = stripePlatform();
  const baseUrl = appBaseUrl();

  let acctId = (restaurant.stripe_account_id as string | null) ?? null;

  // Create connect account if missing
  if (!acctId) {
    const country = process.env.DEFAULT_VENDOR_COUNTRY || "ES";

    // ✅ Use Express for account_links onboarding
    const acct = await stripe.accounts.create({
      type: "express",
      country,
      email: user.email ?? undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        product_description: "Depósitos para reservas",
      },
    });

    acctId = acct.id;

    // ✅ Write with admin to avoid RLS issues, but still scope to this owner for safety
    const admin = supabaseAdmin();
    const { error: upErr } = await admin
      .from("restaurants")
      .update({
        stripe_account_id: acctId,
        stripe_onboarding_complete: false,
      })
      .eq("id", restaurant.id)
      .eq("owner_user_id", user.id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  // Create onboarding link
  const link = await stripe.accountLinks.create({
    account: acctId,
    refresh_url: `${baseUrl}/vendor?stripe=refresh`,
    return_url: `${baseUrl}/api/vendor/stripe/connect/return`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
