"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function VendorLoginPage() {
  const [mounted, setMounted] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Create client only on the client after mount (avoids any SSR/hydration weirdness)
  const supabase = useMemo(() => {
    if (!mounted) return null;
    return supabaseBrowser();
  }, [mounted]);

  async function sendLink() {
    if (!supabase) return;

    setErr(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) return setErr(error.message);
      setSent(true);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send link");
    }
  }

  // Important: initial server render == initial client render
  if (!mounted) return null;

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Restaurant login</h1>
      <p className="small">
        Enter your email. We’ll send a magic link (auto-registers if new).
      </p>

      <label>Email</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="owner@restaurant.com"
      />

      <div className="hstack" style={{ marginTop: 12 }}>
        <button
          className="primary"
          onClick={sendLink}
          disabled={!email || sent || !supabase}
        >
          {sent ? "Link sent ✅" : "Send magic link"}
        </button>
        <a className="small" href="/vendor">
          Back
        </a>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      {sent ? (
        <p className="small">Check your inbox and click the link.</p>
      ) : null}
    </main>
  );
}
