import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const legalVersion =
    typeof body?.legal_version === "string" && body.legal_version.trim()
      ? body.legal_version.trim()
      : "2026-02-10"; // ✅ change this when you update legal docs

  // Find the restaurant owned by this user
  const { data: restaurant, error: e1 } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (e1 || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  // Write acceptance
  const { error: e2 } = await supabase
    .from("restaurants")
    .update({
      legal_accepted_at: new Date().toISOString(),
      legal_version: legalVersion,
    })
    .eq("id", restaurant.id);

  if (e2) {
    return NextResponse.json({ error: "Failed to store legal acceptance" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
