import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Always refresh the session so cookies stay valid
  const { data: { user } } = await supabase.auth.getUser();

  // Protect /admin/* — requires a logged-in user whose email is in ADMIN_EMAILS
  if (req.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/vendor/login", req.url));
    }

    const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!allowedEmails.includes(user.email?.toLowerCase() ?? "")) {
      return NextResponse.redirect(new URL("/vendor", req.url));
    }
  }

  return res;
}

// Only routes that use the restaurant's login session. Previously "/api/:path*"
// also matched the Stripe webhooks and the guest routes: they have no login
// cookie, but each request still paid for a getUser() call to Supabase Auth
// (extra latency on every webhook, and webhooks have a timeout).
export const config = {
  matcher: ["/vendor/:path*", "/admin/:path*", "/api/vendor/:path*", "/api/admin/:path*"],
};
