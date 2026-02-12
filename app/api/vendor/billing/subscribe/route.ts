import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEGAL_VERSION = "2026-02-10_v1";

export async function POST(req: Request) {
  const supabase = supabaseServer();

  const { data: u, error: uErr } = await supabase.auth.getUser();
  const user = u?.user;

  if (uErr) {
    return NextResponse.json({ error: `Auth error: ${uErr.message}` }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Body can be empty (some callers); safe parse
  const body = await req.json().catch(() => ({}));
  const acceptTerms = Boolean(body?.accept_terms);

  const { data: restaurant, error: e1 } = await supabase
    .from("restaurants")
    .select("id, owner_user_id, stripe_customer_id, legal_accepted_at, legal_version")
    .eq("owner_user_id", user.id)
    .single();

  if (e1 || !restaurant) {
    return NextResponse.json(
      { error: `Restaurant not found: ${e1?.message ?? "unknown"}` },
      { status: 404 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_PLATFORM_SECRET_KEY!, {
    apiVersion: "2024-06-20",
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const returnUrl = `${appUrl}/vendor`;

  const hasAcceptedCurrentLegal =
    Boolean(restaurant.legal_accepted_at) && restaurant.legal_version === LEGAL_VERSION;

  // ✅ ALWAYS require explicit acceptance if not already accepted
  if (!hasAcceptedCurrentLegal) {
    if (!acceptTerms) {
      return NextResponse.json(
        { error: "Debes aceptar los términos antes de suscribirte." },
        { status: 400 }
      );
    }

    // ✅ Use admin for the write (avoids RLS/session edge cases)
    // Still scoped to this owner for safety.
    const admin = supabaseAdmin();
    const { error: e2 } = await admin
      .from("restaurants")
      .update({
        legal_accepted_at: new Date().toISOString(),
        legal_version: LEGAL_VERSION,
      })
      .eq("id", restaurant.id)
      .eq("owner_user_id", user.id);

    if (e2) {
      // Return the real reason (critical for debugging prod)
      return NextResponse.json(
        { error: `No se pudo guardar la aceptación legal: ${e2.message}` },
        { status: 500 }
      );
    }
  }

  // ✅ If we already have a Stripe Customer, go to Customer Portal
  if (restaurant.stripe_customer_id) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: restaurant.stripe_customer_id,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: portal.url });
  }

  // ✅ Otherwise, create subscription checkout
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_SUB_PRICE_ID!, quantity: 1 }],
    success_url: `${returnUrl}?sub=success`,
    cancel_url: `${returnUrl}?sub=cancel`,
    client_reference_id: restaurant.id,
    metadata: { restaurant_id: restaurant.id },
    customer_email: user.email ?? undefined,
  });

  return NextResponse.json({ url: session.url });
}
