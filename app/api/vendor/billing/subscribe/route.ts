import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEGAL_VERSION = "2026-02-10_v1";

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Read body (optional). Some calls (portal) may send empty body.
  const body = await req.json().catch(() => ({}));
  const acceptTerms = Boolean(body?.accept_terms);

  const { data: restaurant, error: e1 } = await supabase
    .from("restaurants")
    .select("id, stripe_customer_id, legal_accepted_at, legal_version")
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
  // We allow this even if legal acceptance isn't stored, because they're already a customer.
  if (restaurant.stripe_customer_id) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: restaurant.stripe_customer_id,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: portal.url });
  }

  // ✅ Determine whether we already have valid acceptance for current legal version
  const hasAcceptedCurrentLegal =
    Boolean(restaurant.legal_accepted_at) && restaurant.legal_version === LEGAL_VERSION;

  // ✅ For FIRST subscription only: require acceptance if not already accepted
  if (!hasAcceptedCurrentLegal) {
    if (!acceptTerms) {
      return NextResponse.json(
        { error: "Debes aceptar los términos antes de suscribirte." },
        { status: 400 }
      );
    }

    // Persist acceptance (only when needed)
    const { error: e2 } = await supabase
      .from("restaurants")
      .update({
        legal_accepted_at: new Date().toISOString(),
        legal_version: LEGAL_VERSION,
      })
      .eq("id", restaurant.id);

    if (e2) {
      return NextResponse.json(
        { error: "No se pudo guardar la aceptación legal." },
        { status: 500 }
      );
    }
  }

  // ✅ Create a NEW subscription checkout
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
