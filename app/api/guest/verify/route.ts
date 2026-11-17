import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripePlatform, asConnectedAccount } from "@/lib/stripe";
import { markReservationPaidFromSession } from "@/lib/reservation-payments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Called by /success right after the guest pays. Anyone can call it with any
 * rid/sid, so it proves nothing by itself: all checks (session belongs to
 * this reservation, right account, right amount) live in
 * markReservationPaidFromSession(). The Connect webhook does the same job if
 * the guest never reaches /success.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rid = url.searchParams.get("rid");
  const sid = url.searchParams.get("sid");
  if (!rid || !sid) return NextResponse.json({ error: "Missing rid or sid" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: reservation } = await admin.from("reservations").select("restaurant_id").eq("id", rid).maybeSingle();
  if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("stripe_account_id")
    .eq("id", reservation.restaurant_id)
    .maybeSingle();
  if (!restaurant?.stripe_account_id) {
    return NextResponse.json({ error: "Restaurant missing stripe account" }, { status: 409 });
  }

  let session;
  try {
    // Retrieved ON the restaurant's connected account: a session id from any
    // other account simply isn't found here.
    session = await stripePlatform().checkout.sessions.retrieve(sid, asConnectedAccount(restaurant.stripe_account_id));
  } catch {
    return NextResponse.json({ error: "Payment session not found" }, { status: 404 });
  }

  const result = await markReservationPaidFromSession(session, restaurant.stripe_account_id, rid);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.httpStatus });

  return NextResponse.json({ ok: true });
}
