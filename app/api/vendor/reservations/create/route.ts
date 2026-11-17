import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { appBaseUrl } from "@/lib/stripe";
import { isSubscriptionActive } from "@/lib/subscription";

const schema = z.object({
  restaurantId: z.string().uuid(),
  customerName: z.string().optional().default(""),
  datetimeISO: z.string().min(1),
  partySize: z.number().int().min(1),
  depositCents: z.number().int().min(0),
  policyText: z.string().min(1)
});

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

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

  const { data: inserted, error } = await supabase
    .from("reservations")
    .insert({
      restaurant_id: restaurant.id,
      customer_name: parsed.data.customerName ?? "",
      datetime_iso: parsed.data.datetimeISO,
      party_size: parsed.data.partySize,
      deposit_cents: parsed.data.depositCents,
      policy_text: parsed.data.policyText,
      status: "PENDING"
    })
    .select("*")
    .single();

  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });

  return NextResponse.json({ reservation: inserted, customerUrl: `${appBaseUrl()}/r/${inserted.id}` });
}
