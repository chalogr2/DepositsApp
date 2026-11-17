import { supabaseServer } from "@/lib/supabase/server";
import NewReservationClient from "./new-reservation-client";
import { isSubscriptionActive } from "@/lib/subscription";

export default async function NewReservationPage() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="card">
        <h1 style={{ marginTop: 0 }}>Crear reserva</h1>
        <p className="small">Por favor <a href="/vendor/login">inicia sesión</a> primero.</p>
      </main>
    );
  }

  const { data: restaurant } = await supabase.from("restaurants").select("*").eq("owner_user_id", user.id).single();
  if (!restaurant) {
    return <main className="card"><h1 style={{ marginTop: 0 }}>Crear reserva</h1><p className="small" style={{ color: "var(--danger)" }}>Falta el perfil del restaurante.</p></main>;
  }

  // Shared rule (was a hand-written copy of it here)
  const subActive = isSubscriptionActive(restaurant);
  const connectReady = Boolean(restaurant.stripe_account_id) && Boolean(restaurant.stripe_onboarding_complete);
  const blocked = !(subActive && connectReady);

  return <NewReservationClient restaurantId={restaurant.id} restaurantName={restaurant.name ?? ""} blocked={blocked} />;
}
