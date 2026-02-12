import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripePlatform, appBaseUrl } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  // 1) auth with user session
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  // 2) read restaurant with admin (bypasses RLS) but still scope by owner_user_id
  const admin = supabaseAdmin();

  const { data: restaurant, error: rErr } = await admin
    .from("restaurants")
    .select("id, owner_user_id, stripe_account_id, stripe_onboarding_complete")
    .eq("owner_user_id", user.id)
    .single();

  if (rErr || !restaurant) {
    return NextResponse.json({ error: "Restaurant profile missing" }, { status: 404 });
  }

  const stripe = stripePlatform();
  const baseUrl = appBaseUrl();

  // 3) create Stripe connected account if missing
  let acctId = restaurant.stripe_account_id as string | null;

  if (!acctId) {
    const country = process.env.DEFAULT_VENDOR_COUNTRY || "ES";

    const acct = await stripe.accounts.create({
      type: "standard",
      country,
    });

    acctId = acct.id;

    // ✅ update using admin client so RLS cannot block it
    const { error: uErr } = await admin
      .from("restaurants")
      .update({
        stripe_account_id: acctId,
        stripe_onboarding_complete: false,
      })
      .eq("id", restaurant.id)
      .eq("owner_user_id", user.id); // extra safety

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  // 4) generate account onboarding link
  // NOTE: Account Links use refresh_url + return_url (no redirect_url) :contentReference[oaicite:1]{index=1}
  const link = await stripe.accountLinks.create({
    account: acctId,
    refresh_url: `${baseUrl}/vendor`,
    return_url: `${baseUrl}/api/vendor/stripe/connect/return`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
