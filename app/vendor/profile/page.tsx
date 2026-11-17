import { supabaseServer } from "@/lib/supabase/server";
import VendorProfileClient from "./vendor-profile-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VendorProfilePage() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="card">
        <h1 style={{ marginTop: 0 }}>Editar restaurante</h1>
        <p className="small">No has iniciado sesión.</p>
        <a href="/vendor/login"><button className="primary">Entrar</button></a>
      </main>
    );
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name")
    .eq("owner_user_id", user.id)
    .single();

  return <VendorProfileClient initialName={restaurant?.name ?? ""} />;
}