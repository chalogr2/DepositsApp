import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export async function GET() {
  // Verify the caller is an authenticated admin
  const supabase = supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const admin = supabaseAdmin();
    const { data: restaurants, error } = await admin
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json(
        { error: error.message, restaurants: [] },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const enriched = (restaurants ?? []).map((r: any) => ({
      ...r,
      is_active: r.subscription_status === "active" || r.subscription_status === "trialing",
    }));

    return NextResponse.json(
      { restaurants: enriched },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? String(err), restaurants: [] },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
