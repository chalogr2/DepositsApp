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
      setErr(e?.message ?? "No se pudo enviar el enlace");
    }
  }

  // Important: initial server render == initial client render
  if (!mounted) return null;

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Acceso del restaurante</h1>
      <p className="small">
        Introduce tu correo. Te enviaremos un enlace mágico (se registra automáticamente si eres nuevo).
      </p>

      <label>Correo electrónico</label>
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
          {sent ? "Enlace enviado ✅" : "Enviar enlace mágico"}
        </button>
        <a className="small" href="/vendor">
          Volver
        </a>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      {sent ? (
        <p className="small">Revisa tu bandeja de entrada y haz clic en el enlace.</p>
      ) : null}
    </main>
  );
}
