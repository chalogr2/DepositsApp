import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = supabaseAdmin();

    // Fetch ALL restaurants
    const { data: restaurants, error } = await supabase
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

    // Add derived flag for admin convenience
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