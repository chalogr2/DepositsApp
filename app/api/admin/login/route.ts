import { NextResponse } from "next/server";
import { z } from "zod";
const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const expected = process.env.ADMIN_DEMO_PASSWORD || "changeme";
  if (parsed.data.password !== expected) return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
