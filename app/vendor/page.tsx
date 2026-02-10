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
        <h1 style={{ marginTop: 0 }}>Portal del restaurante</h1>
        <p className="small">No has iniciado sesión.</p>
        <a href="/vendor/login">
          <button className="primary">Iniciar sesión / Registrarse</button>
        </a>
      </main>
    );
  }

  await supabase.rpc("ensure_restaurant_for_user", { p_owner_user_id: user.id });

  // ✅ Select only what we need + include legal columns
  const { data: restaurantRaw, error } = await supabase
    .from("restaurants")
    .select(
      `
        id,
        name,
        owner_user_id,
        stripe_account_id,
        stripe_onboarding_complete,
        stripe_customer_id,
        stripe_subscription_id,
        subscription_status,
        subscription_current_period_end,
        legal_accepted_at,
        legal_version
      `
    )
    .eq("owner_user_id", user.id)
    .single();

  // ✅ Cast to any to avoid TS complaining about column types
  const restaurant: any = restaurantRaw;

  if (error || !restaurant) {
    return (
      <main className="card">
        <h1 style={{ marginTop: 0 }}>Portal del restaurante</h1>
        <p className="small" style={{ color: "var(--danger)" }}>
          No se pudo cargar el perfil del restaurante. Verifica el SQL de Supabase y las políticas RLS.
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

      const acct: any = await stripe.accounts.retrieve(restaurant.stripe_account_id);

      const ready = Boolean(acct?.details_submitted) && Boolean(acct?.charges_enabled);

      if (Boolean(restaurant.stripe_onboarding_complete) !== ready) {
        await supabase
          .from("restaurants")
          .update({ stripe_onboarding_complete: ready })
          .eq("id", restaurant.id);

        restaurant.stripe_onboarding_complete = ready;
      }
    } catch {
      // don't change anything if Stripe fails
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
