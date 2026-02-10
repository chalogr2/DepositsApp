"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

function formatEUR(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function statusLabel(s: string) {
  switch (s) {
    case "PAID":
      return "✅ PAGADO";
    case "PENDING":
      return "❌ PENDIENTE";
    case "CANCELED":
      return "❌ CANCELADO";
    case "EXPIRED":
      return "❌ EXPIRADA";
    default:
      return s || "—";
  }
}

const LEGAL_VERSION = "2026-02-10_v1";

export default function VendorDashboardClient({ userEmail, restaurant, reservations }: any) {
  const supabase = supabaseBrowser();
  const [err, setErr] = useState<string | null>(null);

  // hydration-safe date formatting
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // simple "copied" feedback per reservation id
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // acceptance checkbox state
  const [acceptTerms, setAcceptTerms] = useState(false);

  const subActive =
    restaurant.subscription_status === "active" &&
    (!restaurant.subscription_current_period_end ||
      new Date(restaurant.subscription_current_period_end) > new Date());

  // ✅ only true-connect when onboarding is complete
  const connectReady =
    Boolean(restaurant.stripe_account_id) && Boolean(restaurant.stripe_onboarding_complete);

  const hasAcceptedCurrentLegal =
    Boolean(restaurant.legal_accepted_at) && restaurant.legal_version === LEGAL_VERSION;

  const mustAcceptLegalToSubscribe = !restaurant.stripe_customer_id && !hasAcceptedCurrentLegal;

  const gatingMessage = useMemo(() => {
    if (!subActive) return "Suscríbete para desbloquear la creación de enlaces de pago.";
    if (!connectReady) return "Conecta Stripe para aceptar pagos con tarjeta.";
    return null;
  }, [subActive, connectReady]);

  function formatDateSafe(iso: string) {
    if (!mounted) return iso;
    return new Date(iso).toLocaleString();
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/vendor";
  }

  async function startConnect() {
    setErr(null);
    const res = await fetch("/api/vendor/stripe/connect/onboard", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data?.error ?? "No se pudo iniciar la conexión");
    window.location.href = data.url;
  }

  async function manageConnect() {
    setErr(null);
    const res = await fetch("/api/vendor/stripe/connect/manage", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data?.error ?? "No se pudo abrir el panel de Stripe");
    window.location.href = data.deep_link || data.url;
  }

  async function subscribe() {
    setErr(null);

    // ✅ If first time and not accepted, block here (clean UX)
    if (mustAcceptLegalToSubscribe && !acceptTerms) {
      return setErr("Debes aceptar los términos antes de suscribirte.");
    }

    const res = await fetch("/api/vendor/billing/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // only send when relevant; server will ignore if already accepted anyway
        accept_terms: mustAcceptLegalToSubscribe ? true : undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data?.error ?? "No se pudo iniciar la suscripción");
    window.location.href = data.url;
  }

  function reservationUrl(id: string) {
    if (typeof window === "undefined") return `/r/${id}`;
    return `${window.location.origin}/r/${id}`;
  }

  async function copyLink(id: string) {
    const url = reservationUrl(id);

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }

      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 1200);
    } catch {
      setErr("No se pudo copiar el enlace. Intenta de nuevo.");
    }
  }

  const rs = reservations ?? [];

  return (
    <main className="card">
      <div className="hstack" style={{ justifyContent: "space-between" }}>
        <div className="hstack" style={{ gap: 12, alignItems: "baseline" }}>
          <h1 style={{ marginTop: 0, marginBottom: 0 }}>{restaurant.name || "Tu restaurante"}</h1>

          <a href="/vendor/profile" className="small">
            Editar
          </a>
        </div>

        <button onClick={logout}>Cerrar sesión</button>
      </div>

      <p className="small">
        Conectado como: <code>{userEmail}</code>
      </p>

      <div className="hstack">
        <span className={subActive ? "badge ok" : "badge bad"}>
          <span className="dot" />
          Suscripción: {restaurant.subscription_status}
        </span>
        <span className={connectReady ? "badge ok" : "badge bad"}>
          <span className="dot" />
          Stripe: {connectReady ? "conectado" : "no conectado"}
        </span>
      </div>

      <div className="spacer" />

      <div className="row">
        <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
          <h3 style={{ marginTop: 0 }}>1) Suscripción</h3>
          <p className="small">Requerido para crear enlaces de depósito.</p>

          {/* ✅ Only show acceptance box when needed */}
          {mustAcceptLegalToSubscribe ? (
            <div className="small" style={{ marginBottom: 10 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2 }}
                />
                <span>
                  He leído y acepto los{" "}
                  <a href="/terminos" target="_blank" rel="noreferrer">
                    Términos y condiciones
                  </a>
                  , la{" "}
                  <a href="/privacidad" target="_blank" rel="noreferrer">
                    Política de privacidad
                  </a>
                  , la{" "}
                  <a href="/cookies" target="_blank" rel="noreferrer">
                    Política de cookies
                  </a>{" "}
                  y las{" "}
                  <a href="/suscripcion" target="_blank" rel="noreferrer">
                    Condiciones de suscripción
                  </a>
                  .
                </span>
              </label>
            </div>
          ) : null}

          <button className="primary" onClick={subscribe}>
            Suscribirse / Gestionar facturación
          </button>
        </div>

        <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
          <h3 style={{ marginTop: 0 }}>2) Cuenta de Stripe</h3>

          <p className="small">
            {connectReady
              ? "Stripe está conectado. Gestiona pagos, reembolsos y ajustes en tu Panel de Stripe."
              : "Eres el comercio responsable de los cobros a los clientes."}
          </p>

          <button className="primary" onClick={connectReady ? manageConnect : startConnect}>
            {connectReady ? "Gestionar cuenta de Stripe" : "Conectar Stripe"}
          </button>
        </div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
        <h3 style={{ marginTop: 0 }}>3) Crear enlace de reserva</h3>
        <p className="small">
          {gatingMessage ? (
            <span style={{ color: "var(--danger)" }}>{gatingMessage}</span>
          ) : (
            <span>Listo ✅</span>
          )}
        </p>

        <a
          href={Boolean(gatingMessage) ? undefined : "/vendor/reservations/new"}
          onClick={(e) => {
            if (gatingMessage) e.preventDefault();
          }}
        >
          <button className="primary" disabled={Boolean(gatingMessage)}>
            Crear nueva reserva
          </button>
        </a>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      <div className="spacer" />

      <h3>Reservas recientes</h3>

      {/* ✅ Desktop/tablet table */}
      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Nombre</th>
              <th>Comensales</th>
              <th>Depósito</th>
              <th>Enlace</th>
            </tr>
          </thead>
          <tbody>
            {rs.map((r: any) => (
              <tr key={r.id}>
                <td>{statusLabel(r.status)}</td>
                <td>{formatDateSafe(r.datetime_iso)}</td>
                <td>{r.customer_name || "—"}</td>
                <td>{r.party_size}</td>
                <td>{formatEUR(r.deposit_cents)}</td>
                <td>
                  <div className="hstack" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <a href={`/r/${r.id}`} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                    <button
                      type="button"
                      onClick={() => copyLink(r.id)}
                      style={{ padding: "6px 10px" }}
                      aria-label="Copiar enlace"
                      title="Copiar enlace"
                    >
                      {copiedId === r.id ? "¡Copiado!" : "Copiar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {rs.length === 0 ? (
              <tr>
                <td colSpan={6} className="small">
                  Aún no hay reservas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ✅ Mobile-friendly cards */}
      <div className="resCards">
        {rs.length === 0 ? (
          <div className="small">Aún no hay reservas.</div>
        ) : (
          rs.map((r: any) => (
            <div key={r.id} className="resCard">
              <div className="resTop">
                <span className={r.status === "PAID" ? "badge ok" : "badge"}>
                  <span className="dot" />
                  {statusLabel(r.status)}
                </span>

                <div className="hstack" style={{ gap: 8, flexWrap: "nowrap" }}>
                  <a href={`/r/${r.id}`} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                  <button
                    type="button"
                    onClick={() => copyLink(r.id)}
                    style={{ padding: "6px 10px" }}
                    aria-label="Copiar enlace"
                    title="Copiar enlace"
                  >
                    {copiedId === r.id ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>

              <div className="resGrid">
                <div>
                  <div className="small">
                    <b>Fecha</b>
                  </div>
                  <div className="small">{formatDateSafe(r.datetime_iso)}</div>
                </div>

                <div>
                  <div className="small">
                    <b>Depósito</b>
                  </div>
                  <div className="small">{formatEUR(r.deposit_cents)}</div>
                </div>

                <div>
                  <div className="small">
                    <b>Nombre</b>
                  </div>
                  <div className="small">{r.customer_name || "—"}</div>
                </div>

                <div>
                  <div className="small">
                    <b>Comensales</b>
                  </div>
                  <div className="small">{r.party_size}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
