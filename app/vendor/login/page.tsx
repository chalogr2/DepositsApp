"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function VendorLoginPage() {
  const [mounted, setMounted] = useState(false);

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const supabase = useMemo(() => {
    if (!mounted) return null;
    return supabaseBrowser();
  }, [mounted]);

  const emailValid = EMAIL_RE.test(email.trim());

  async function sendLink() {
    if (!supabase) return;

    if (!emailValid) {
      setErr("Introduce un correo electrónico válido.");
      return;
    }

    setErr(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) return setErr(error.message);
      setSent(true);
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo enviar el enlace");
    }
  }

  if (!mounted) return null;

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Acceso del restaurante</h1>
      <p className="small">
        Introduce tu correo. Te enviaremos un enlace mágico (se registra automáticamente si eres nuevo).
      </p>

      <label>Correo electrónico</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="owner@restaurant.com"
        autoComplete="email"
      />

      <div className="hstack" style={{ marginTop: 12 }}>
        <button
          className="primary"
          onClick={sendLink}
          disabled={!emailValid || sent || !supabase}
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
