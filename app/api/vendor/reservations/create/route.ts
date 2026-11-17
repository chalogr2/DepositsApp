import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/stripe";
import { isSubscriptionActive } from "@/lib/subscription";
import { MAX_DEPOSIT_CENTS, MIN_DEPOSIT_CENTS } from "@/lib/config";

const schema = z.object({
  restaurantId: z.string().uuid(),
  customerName: z.string().trim().max(120).optional().default(""),
  // Must be a real instant (the form sends `new Date(local).toISOString()`),
  // and not in the past (5 min grace for clock skew / slow typing).
  datetimeISO: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "Fecha y hora no válidas")
    .refine((s) => Date.parse(s) > Date.now() - 5 * 60 * 1000, "La fecha de la reserva ya ha pasado"),
  partySize: z.number().int().min(1).max(100),
  // Same limits the guest checkout enforces (lib/config.ts). Before this, a
  // €0 or €600 link could be created that the guest could never pay.
  depositCents: z
    .number()
    .int()
    .min(MIN_DEPOSIT_CENTS, `El depósito mínimo es €${(MIN_DEPOSIT_CENTS / 100).toFixed(2)}`)
    .max(MAX_DEPOSIT_CENTS, `El depósito máximo es €${(MAX_DEPOSIT_CENTS / 100).toFixed(2)}`),
  policyText: z.string().trim().min(1).max(2000),
});

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // First human-readable message instead of the raw zod JSON dump
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos no válidos" }, { status: 400 });
  }

  const { data: restaurant, error: re } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", parsed.data.restaurantId)
    .eq("owner_user_id", user.id)
    .single();

  if (re || !restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  // Same rule the dashboard uses (lib/subscription.ts)
  const subActive = isSubscriptionActive(restaurant);
  const connectReady = Boolean(restaurant.stripe_account_id) && Boolean(restaurant.stripe_onboarding_complete);
  if (!(subActive && connectReady)) return NextResponse.json({ error: "Subscription inactive or Stripe not connected" }, { status: 403 });

  // Insert with the service role. The browser role has no INSERT privilege on
  // reservations (migration 003), so THIS route, with the paywall and
  // validation above, is the only way a reservation can be created.
  const { data: inserted, error } = await supabaseAdmin()
    .from("reservations")
    .insert({
      restaurant_id: restaurant.id,
      customer_name: parsed.data.customerName ?? "",
      datetime_iso: new Date(parsed.data.datetimeISO).toISOString(), // normalised UTC
      party_size: parsed.data.partySize,
      deposit_cents: parsed.data.depositCents,
      policy_text: parsed.data.policyText,
      status: "PENDING",
    })
    .select("*")
    .single();

  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });

  return NextResponse.json({ reservation: inserted, customerUrl: `${appBaseUrl()}/r/${inserted.id}` });
}
