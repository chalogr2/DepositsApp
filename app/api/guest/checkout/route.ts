import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripePlatform, asConnectedAccount } from "@/lib/stripe";

const schema = z.object({ reservationId: z.string().uuid() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: reservation } = await admin.from("reservations").select("*").eq("id", parsed.data.reservationId).single();
  if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (reservation.status === "PAID") return NextResponse.json({ error: "Already paid" }, { status: 409 });

  const { data: restaurant } = await admin.from("restaurants").select("*").eq("id", reservation.restaurant_id).single();
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  if (!restaurant.stripe_account_id || !restaurant.stripe_onboarding_complete) {
    return NextResponse.json({ error: "Restaurant cannot accept card payments yet" }, { status: 409 });
  }

  const stripe = stripePlatform();
  // Use the current deployment origin so Stripe always redirects back to the right site
  const baseUrl = new URL(req.url).origin;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: `${baseUrl}/success?rid=${reservation.id}&sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/r/${reservation.id}`,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: reservation.deposit_cents,
          product_data: { name: "Reservation deposit", description: `Deposit for reservation ${reservation.id}` }
        }
      }],
      metadata: { reservation_id: reservation.id, restaurant_id: restaurant.id }
    },
    asConnectedAccount(restaurant.stripe_account_id)
  );

  return NextResponse.json({ url: session.url });
}
