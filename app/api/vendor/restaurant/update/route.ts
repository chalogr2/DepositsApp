import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = supabaseServer();

  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Please enter a valid restaurant name." }, { status: 400 });
  }

  const { error } = await supabase
    .from("restaurants")
    .update({ name })
    .eq("owner_user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
