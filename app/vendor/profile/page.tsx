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
        <h1 style={{ marginTop: 0 }}>Edit restaurant</h1>
        <p className="small">You’re not logged in.</p>
        <a href="/vendor/login"><button className="primary">Login</button></a>
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