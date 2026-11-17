import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripePlatform, asConnectedAccount } from "@/lib/stripe";
import { MAX_DEPOSIT_CENTS, MIN_DEPOSIT_CENTS } from "@/lib/config";
import { expireIfOverdue } from "@/lib/reservation-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({ reservationId: z.string().uuid() });

function normalizeStatus(s: unknown) {
  return String(s ?? "").trim().toUpperCase();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // ✅ Fetch minimum reservation fields
  const { data: reservation } = await admin
    .from("reservations")
    .select("id, restaurant_id, status, deposit_cents, datetime_iso")
    .eq("id", parsed.data.reservationId)
    .single();

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  // ✅ Server-side paid gate
  // A PENDING link whose reservation time has passed is EXPIRED: written to
  // the DB here, so the dashboard shows it too (lib/reservation-lifecycle.ts).
  const status = normalizeStatus(await expireIfOverdue(reservation));

  if (status === "PAID" || status === "ATTENDED" || status === "NO_SHOW") {
    return NextResponse.json({ error: "Already paid" }, { status: 409 });
  }
  if (status === "CANCELED" || status === "CANCELLED") {
    return NextResponse.json({ error: "Reservation canceled" }, { status: 409 });
  }
  if (status === "EXPIRED") {
    return NextResponse.json({ error: "Reservation expired" }, { status: 409 });
  }
  if (status !== "PENDING") {
    return NextResponse.json({ error: "Reservation is not payable" }, { status: 409 });
  }

  // ✅ Amount validation + cap. Same limits as reservation create
  // (lib/config.ts), so this only fires for rows created before that check.
  const amount = Number(reservation.deposit_cents);
  if (!Number.isInteger(amount) || amount < MIN_DEPOSIT_CENTS) {
    return NextResponse.json({ error: "Invalid deposit amount" }, { status: 409 });
  }
  if (amount > MAX_DEPOSIT_CENTS) {
    return NextResponse.json({ error: "Deposit amount too large" }, { status: 409 });
  }

  // ✅ Restaurant payment readiness
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, stripe_account_id, stripe_onboarding_complete")
    .eq("id", reservation.restaurant_id)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  if (!restaurant.stripe_account_id || !restaurant.stripe_onboarding_complete) {
    return NextResponse.json(
      { error: "Restaurant cannot accept card payments yet" },
      { status: 409 }
    );
  }

  // =========================
  // ✅ Abuse prevention (DB)
  //  - reuse active session
  //  - rate limit attempts
  // =========================

  const now = new Date();
  const nowIso = now.toISOString();

  // window: 15 minutes
  const WINDOW_MINUTES = 15;
  const MAX_ATTEMPTS_PER_WINDOW = 10;

  // Session TTL: 30 minutes (Stripe checkout sessions default expiration is longer,
  // but we choose a short TTL to prevent spam & stale links)
  const SESSION_TTL_MINUTES = 30;

  const { data: existing } = await admin
    .from("reservation_checkout_sessions")
    .select("*")
    .eq("reservation_id", reservation.id)
    .maybeSingle();

  // If we have a non-expired stored session URL, reuse it (fast + avoids spam)
  if (existing?.stripe_checkout_session_url && existing?.expires_at) {
    const expiresAt = new Date(existing.expires_at);
    if (expiresAt.getTime() > now.getTime()) {
      return NextResponse.json({ url: existing.stripe_checkout_session_url });
    }
  }

  // Rate limit per reservation (attempts within last 15 minutes)
  // We store attempts_count and last_attempt_at; if last_attempt_at is older than window, reset.
  let attemptsCount = existing?.attempts_count ?? 0;
  const lastAttemptAt = existing?.last_attempt_at ? new Date(existing.last_attempt_at) : null;

  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);
  const isWithinWindow = lastAttemptAt ? lastAttemptAt.getTime() >= windowStart.getTime() : false;

  if (!isWithinWindow) {
    attemptsCount = 0;
  }

  attemptsCount += 1;

  if (attemptsCount > MAX_ATTEMPTS_PER_WINDOW) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  // Pre-write attempt counter (so even if Stripe is slow/fails, spam is limited)
  const expiresAtIso = new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();

  if (existing) {
    await admin
      .from("reservation_checkout_sessions")
      .update({
        attempts_count: attemptsCount,
        last_attempt_at: nowIso,
        // keep expires_at updated even before session creation
        expires_at: expiresAtIso,
      })
      .eq("reservation_id", reservation.id);
  } else {
    await admin.from("reservation_checkout_sessions").insert({
      reservation_id: reservation.id,
      attempts_count: attemptsCount,
      last_attempt_at: nowIso,
      expires_at: expiresAtIso,
    });
  }

  // =========================
  // ✅ Create Stripe session
  // =========================
  const stripe = stripePlatform();
  const baseUrl = new URL(req.url).origin;

  const stripeOpts = {
    ...asConnectedAccount(restaurant.stripe_account_id),
    idempotencyKey: `checkout_res_${reservation.id}`,
  } as any;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: `${baseUrl}/success?rid=${reservation.id}&sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/r/${reservation.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amount,
            product_data: {
              name: "Depósito de reserva",
              description: `Depósito para reserva ${reservation.id}`,
            },
          },
        },
      ],
      metadata: {
        reservation_id: reservation.id,
        restaurant_id: restaurant.id,
      },
    },
    stripeOpts
  );

  // Save session id + url for reuse
  await admin
    .from("reservation_checkout_sessions")
    .update({
      stripe_checkout_session_id: session.id,
      stripe_checkout_session_url: session.url,
      // keep expires_at as our TTL
      expires_at: expiresAtIso,
    })
    .eq("reservation_id", reservation.id);

  return NextResponse.json({ url: session.url });
}
