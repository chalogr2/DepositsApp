import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripePlatform, asConnectedAccount } from "@/lib/stripe";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rid = url.searchParams.get("rid");
  const sid = url.searchParams.get("sid");
  if (!rid || !sid) return NextResponse.json({ error: "Missing rid or sid" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: reservation } = await admin.from("reservations").select("*").eq("id", rid).single();
  if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const { data: restaurant } = await admin.from("restaurants").select("*").eq("id", reservation.restaurant_id).single();
  if (!restaurant?.stripe_account_id) return NextResponse.json({ error: "Restaurant missing stripe account" }, { status: 409 });

  const stripe = stripePlatform();
  const session = await stripe.checkout.sessions.retrieve(sid, asConnectedAccount(restaurant.stripe_account_id));

  if (session.payment_status !== "paid") return NextResponse.json({ error: "Payment not completed" }, { status: 409 });

  await admin.from("reservations").update({
    status: "PAID",
    stripe_payment_intent_id: session.payment_intent as string | null
  }).eq("id", rid);

  return NextResponse.json({ ok: true });
}
