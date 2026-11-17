"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LEGAL_VERSION } from "@/lib/config";
import { isSubscriptionActive, subscriptionLabel } from "@/lib/subscription";
import { formatReservationDate } from "@/lib/datetime";

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

export default function VendorDashboardClient({ userEmail, restaurant, reservations }: any) {
  // Stable reference (createBrowserClient is a singleton anyway, but this makes
  // it explicit so the realtime effect below doesn't re-run every render)
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [err, setErr] = useState<string | null>(null);

  // hydration-safe date formatting
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // simple "copied" feedback per reservation id
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // acceptance checkbox state
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Shared with the reservations API so UI and server always agree
  const subActive = isSubscriptionActive(restaurant);
  // Badge text derived from the same logic (shows "caducada" when the DB says
  // "active" but the paid period is over, instead of a red "active")
  const subLabel = subscriptionLabel(restaurant);

  // ✅ only true-connect when onboarding is complete
  const connectReady =
    Boolean(restaurant.stripe_account_id) && Boolean(restaurant.stripe_onboarding_complete);

  const hasAcceptedCurrentLegal =
    Boolean(restaurant.legal_accepted_at) && restaurant.legal_version === LEGAL_VERSION;

  // ✅ CHANGE: require acceptance whenever current legal hasn't been accepted (regardless of stripe_customer_id)
  const mustAcceptLegalToProceed = !hasAcceptedCurrentLegal;

  const gatingMessage = useMemo(() => {
    if (!subActive) return "Suscríbete para desbloquear la creación de enlaces de pago.";
    if (!connectReady) return "Conecta Stripe para aceptar pagos con tarjeta.";
    return null;
  }, [subActive, connectReady]);

  function formatDateSafe(iso: string) {
    // Kept the `mounted` guard: Node's and the browser's Intl data can differ
    // in tiny details (e.g. separators), which would cause a hydration warning.
    if (!mounted) return iso;
    // Fixed locale + Europe/Madrid instead of the viewer's machine settings
    return formatReservationDate(iso, "short");
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

    // ✅ Block if must accept and checkbox isn't checked
    if (mustAcceptLegalToProceed && !acceptTerms) {
      return setErr("Debes aceptar los términos antes de continuar.");
    }

    const res = await fetch("/api/vendor/billing/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // send the actual checkbox value when needed
        accept_terms: mustAcceptLegalToProceed ? acceptTerms : undefined,
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

  // =========================================================================
  // ✅ Live reservations table (Supabase Realtime)
  //
  // The server renders the first list (`reservations` prop). After that we
  // listen for INSERT/UPDATE/DELETE on THIS restaurant's reservations and
  // re-fetch the list, so a guest payment flips the row to PAGADO without a
  // manual reload. RLS ("reservations_select_own") still applies: Realtime
  // only delivers rows this logged-in owner is allowed to read.
  // Requires migrations/002_realtime_reservations.sql (adds the table to the
  // `supabase_realtime` publication).
  // =========================================================================
  const [rs, setRs] = useState<any[]>(reservations ?? []);
  const [live, setLive] = useState(false);
  // Rows that just became PAID, briefly highlighted so the change is noticed
  const [justPaid, setJustPaid] = useState<Set<string>>(() => new Set());
  // Last known status per row, to detect "PENDING -> PAID" transitions
  const lastStatus = useRef<Map<string, string>>(
    new Map((reservations ?? []).map((r: any) => [r.id, r.status]))
  );

  const reloadReservations = useCallback(async () => {
    // Same query as the server page (app/vendor/page.tsx), scoped by RLS
    const { data, error } = await supabase
      .from("reservations")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error || !data) return; // keep showing the current list

    const newlyPaid = data
      .filter((r: any) => r.status === "PAID" && lastStatus.current.has(r.id) && lastStatus.current.get(r.id) !== "PAID")
      .map((r: any) => r.id as string);
    lastStatus.current = new Map(data.map((r: any) => [r.id, r.status]));
    setRs(data);

    if (newlyPaid.length) {
      setJustPaid((cur) => new Set([...Array.from(cur), ...newlyPaid]));
      window.setTimeout(() => {
        setJustPaid((cur) => {
          const next = new Set(cur);
          newlyPaid.forEach((id) => next.delete(id));
          return next;
        });
      }, 4000);
    }
  }, [supabase, restaurant.id]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    (async () => {
      // Make sure the realtime socket uses the logged-in user's token (not the
      // anon key); otherwise RLS would filter out every event.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(`reservations:${restaurant.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "reservations",
            filter: `restaurant_id=eq.${restaurant.id}`,
          },
          () => {
            // Re-fetch rather than patch from the payload: keeps sorting and the
            // 25-row limit correct, and is just one small query per change.
            reloadReservations();
          }
        )
        .subscribe((status) => {
          setLive(status === "SUBSCRIBED");
          // Fires on first connect AND after every reconnect (wifi drop, laptop
          // sleep), so we catch any change missed while disconnected.
          if (status === "SUBSCRIBED") reloadReservations();
        });
    })();

    // Safety net: browsers throttle background tabs; refresh when the owner
    // comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadReservations();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, restaurant.id, reloadReservations]);

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
          Suscripción: {subLabel}
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

          {/* ✅ Show acceptance box whenever legal is not accepted for current version */}
          {mustAcceptLegalToProceed ? (
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

          <button
            className="primary"
            onClick={subscribe}
            disabled={mustAcceptLegalToProceed && !acceptTerms}
            title={mustAcceptLegalToProceed && !acceptTerms ? "Debes aceptar los términos" : undefined}
          >
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

      <div className="hstack" style={{ alignItems: "baseline", gap: 10 }}>
        <h3>Reservas recientes</h3>
        <span
          className="small"
          title={live ? "La tabla se actualiza sola al recibir pagos" : "Sin conexión en tiempo real"}
          style={{ color: live ? "var(--ok)" : undefined, opacity: live ? 1 : 0.6 }}
        >
          ● {live ? "En vivo" : "Conectando…"}
        </span>
      </div>

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
              <tr key={r.id} className={justPaid.has(r.id) ? "justPaid" : undefined}>
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
            <div key={r.id} className={justPaid.has(r.id) ? "resCard justPaid" : "resCard"}>
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
