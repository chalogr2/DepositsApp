import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LEGAL_VERSION } from "@/lib/config";
import { stripePlatform, appBaseUrl } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  // Shared helpers: same Stripe client + same base-URL logic as the rest of the app
  // (appBaseUrl() reads NEXT_PUBLIC_APP_URL, then APP_BASE_URL, then VERCEL_URL).
  const stripe = stripePlatform();
  const returnUrl = `${appBaseUrl()}/vendor`;

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

  try {
    // Which Stripe customer (if any) the new Checkout should be attached to.
    let customerId: string | null = restaurant.stripe_customer_id ?? null;

    if (customerId) {
      // ✅ Having a customer id does NOT mean having a subscription.
      // Ask Stripe (the source of truth) instead of trusting our DB copy.
      const { customerExists, live } = await findLiveSubscription(stripe, customerId);

      // Still subscribed (or needs to fix a payment) -> manage it in the Portal
      if (live) {
        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl,
        });
        return NextResponse.json({ url: portal.url });
      }

      // No live subscription: our DB row is stale. Self-heal it so the
      // dashboard stops claiming "active", then fall through to Checkout.
      const admin = supabaseAdmin();
      await admin
        .from("restaurants")
        .update({
          subscription_status: "inactive",
          stripe_subscription_id: null,
          subscription_current_period_end: null,
          // If the customer itself is gone from Stripe, forget it too
          ...(customerExists ? {} : { stripe_customer_id: null }),
        })
        .eq("id", restaurant.id)
        .eq("owner_user_id", user.id);

      if (!customerExists) customerId = null;
    }

    // ✅ Create subscription checkout (first-time OR re-subscribe)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_SUB_PRICE_ID!, quantity: 1 }],
      // {CHECKOUT_SESSION_ID} is replaced by Stripe with the real session id.
      // The dashboard uses it to sync the new subscription immediately on
      // return, instead of waiting for the webhook (see lib/billing-sync.ts).
      success_url: `${returnUrl}?sub=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?sub=cancel`,
      client_reference_id: restaurant.id,
      metadata: { restaurant_id: restaurant.id },
      // Put restaurant_id on the SUBSCRIPTION too, so customer.subscription.*
      // webhooks can map straight to the restaurant without a DB lookup.
      subscription_data: { metadata: { restaurant_id: restaurant.id } },
      // Spanish invoicing (B2B): the invoice must show the restaurant's legal
      // name, address and NIF/CIF. Checkout collects them and Stripe prints
      // them on every subscription invoice. (No IVA line is added yet; that's a
      // pending business decision, see DEVLOG.)
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      // Stripe requires this when collecting tax ids for an EXISTING customer:
      // it allows Checkout to save the entered name/address on that customer.
      ...(customerId ? { customer_update: { name: "auto", address: "auto" } } : {}),
      // Reuse the existing customer (keeps invoice history in one place);
      // Stripe only accepts one of `customer` / `customer_email`.
      ...(customerId
        ? { customer: customerId }
        : { customer_email: user.email ?? undefined }),
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    // Return JSON (not an HTML 500 page) so the dashboard can show the reason
    return NextResponse.json(
      { error: `Error de Stripe: ${e?.message ?? "desconocido"}` },
      { status: 500 }
    );
  }
}

/**
 * Subscription statuses where the restaurant still "has" a subscription and
 * should manage it in the Billing Portal (cancel, update card, pay overdue
 * invoice). Anything else (canceled, incomplete_expired, incomplete, or no
 * subscription at all) means they need a NEW Checkout.
 */
const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

async function findLiveSubscription(
  stripe: Stripe,
  customerId: string
): Promise<{ customerExists: boolean; live: Stripe.Subscription | null }> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ((customer as Stripe.DeletedCustomer).deleted) return { customerExists: false, live: null };
  } catch (e: any) {
    if (e?.code === "resource_missing") return { customerExists: false, live: null };
    throw e;
  }

  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  const live = subs.data.find((s) => LIVE_SUBSCRIPTION_STATUSES.has(s.status)) ?? null;
  return { customerExists: true, live };
}
