import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import VendorDashboardClient from "./vendor-dashboard-client";
import Stripe from "stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VendorPage() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="card">
        <h1 style={{ marginTop: 0 }}>Restaurant portal</h1>
        <p className="small">You’re not logged in.</p>
        <a href="/vendor/login">
          <button className="primary">Login / Register</button>
        </a>
      </main>
    );
  }

  await supabase.rpc("ensure_restaurant_for_user", { p_owner_user_id: user.id });

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("owner_user_id", user.id)
    .single();

  if (error || !restaurant) {
    return (
      <main className="card">
        <h1 style={{ marginTop: 0 }}>Restaurant portal</h1>
        <p className="small" style={{ color: "var(--danger)" }}>
          Failed to load restaurant profile. Verify Supabase SQL + RLS.
        </p>
      </main>
    );
  }

  // ✅ Sync Stripe readiness from Stripe (only if we have an account id)
  if (restaurant.stripe_account_id) {
    try {
      const stripe = new Stripe(process.env.STRIPE_PLATFORM_SECRET_KEY!, {
        apiVersion: "2024-06-20",
      });

      const acct = await stripe.accounts.retrieve(restaurant.stripe_account_id);

      const ready =
        Boolean((acct as any).details_submitted) && Boolean((acct as any).charges_enabled);

      // Update only if changed (avoid extra writes)
      if (Boolean(restaurant.stripe_onboarding_complete) !== ready) {
        await supabase
          .from("restaurants")
          .update({ stripe_onboarding_complete: ready })
          .eq("id", restaurant.id);

        // Keep local object consistent for this request
        restaurant.stripe_onboarding_complete = ready;
      }
    } catch {
      // If Stripe call fails, do NOT mark as connected.
      // Just leave current DB value as-is.
    }
  }

  // one-time onboarding gate
  const name = String(restaurant.name ?? "").trim();
  const needsName = !name || name === "My Restaurant";
  if (needsName) redirect("/vendor/onboarding");

  const { data: reservations } = await supabase
    .from("reservations")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .limit(25);

  return (
    <VendorDashboardClient
      userEmail={user.email ?? ""}
      restaurant={restaurant}
      reservations={reservations ?? []}
    />
  );
}