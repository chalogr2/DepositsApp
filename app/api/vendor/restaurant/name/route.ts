import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();
    const { data: u, error: uErr } = await supabase.auth.getUser();
    const user = u?.user;

    if (uErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawName = String(body?.name ?? "").trim();

    if (rawName.length < 2) {
      return NextResponse.json({ error: "Restaurant name is too short." }, { status: 400 });
    }
    if (rawName.length > 80) {
      return NextResponse.json({ error: "Restaurant name is too long (max 80 chars)." }, { status: 400 });
    }

    // Write with the service role: the browser role has no UPDATE privilege
    // (migration 003). Scoped to the caller's own row via owner_user_id, and
    // only after the length validation above.
    const { data: restaurant, error: rErr } = await supabaseAdmin()
      .from("restaurants")
      .update({ name: rawName })
      .eq("owner_user_id", user.id)
      .select("id,name")
      .single();

    if (rErr || !restaurant) {
      return NextResponse.json(
        { error: rErr?.message ?? "Failed to update restaurant name" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, restaurant });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}