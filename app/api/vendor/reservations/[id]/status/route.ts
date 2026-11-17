import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { applyReservationAction } from "@/lib/reservation-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/vendor/reservations/:id/status   body: { action: "cancel" | "no_show" | "attended" }
 *
 * Thin route: authenticate, validate input, delegate. All rules (ownership,
 * which actions are allowed, refunds) live in lib/reservation-lifecycle.ts.
 * The browser cannot change a status itself: it has no UPDATE privilege on
 * reservations (migration 003).
 */
const params = z.object({ id: z.string().uuid() });
const body = z.object({ action: z.enum(["cancel", "no_show", "attended"]) });

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) return NextResponse.json({ error: "No has iniciado sesión" }, { status: 401 });

  const p = params.safeParse(ctx.params);
  const b = body.safeParse(await req.json().catch(() => null));
  if (!p.success || !b.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });

  try {
    const result = await applyReservationAction({
      reservationId: p.data.id,
      ownerUserId: user.id,
      action: b.data.action,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
