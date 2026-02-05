"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

function formatEUR(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

export default function VendorDashboardClient({ userEmail, restaurant, reservations }: any) {
  const supabase = supabaseBrowser();
  const [err, setErr] = useState<string | null>(null);

  // hydration-safe date formatting
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const subActive =
    restaurant.subscription_status === "active" &&
    (!restaurant.subscription_current_period_end ||
      new Date(restaurant.subscription_current_period_end) > new Date());

  // ✅ only true-connect when onboarding is complete
  const connectReady =
    Boolean(restaurant.stripe_account_id) && Boolean(restaurant.stripe_onboarding_complete);

  const gatingMessage = useMemo(() => {
    if (!subActive) return "Subscribe to unlock creating payment links.";
    if (!connectReady) return "Connect Stripe to accept card payments.";
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
    if (!res.ok) return setErr(data?.error ?? "Failed to start onboarding");
    window.location.href = data.url;
  }

  async function manageConnect() {
    setErr(null);
    const res = await fetch("/api/vendor/stripe/connect/manage", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data?.error ?? "Failed to open Stripe dashboard");
    window.location.href = data.deep_link || data.url;
  }

  async function subscribe() {
    setErr(null);
    const res = await fetch("/api/vendor/billing/subscribe", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data?.error ?? "Failed to start subscription");
    window.location.href = data.url;
  }

  const rs = reservations ?? [];

  return (
    <main className="card">
      <div className="hstack" style={{ justifyContent: "space-between" }}>
        <div className="hstack" style={{ gap: 12, alignItems: "baseline" }}>
          <h1 style={{ marginTop: 0, marginBottom: 0 }}>
            {restaurant.name || "Your restaurant"}
          </h1>

          {/* ✅ Avoid <a><button/></a> nesting */}
          <a href="/vendor/profile" className="small">
            Edit
          </a>
        </div>

        <button onClick={logout}>Logout</button>
      </div>

      <p className="small">
        Logged in as: <code>{userEmail}</code>
      </p>

      <div className="hstack">
        <span className={subActive ? "badge ok" : "badge bad"}>
          <span className="dot" />
          Subscription: {restaurant.subscription_status}
        </span>
        <span className={connectReady ? "badge ok" : "badge bad"}>
          <span className="dot" />
          Stripe: {connectReady ? "connected" : "not connected"}
        </span>
      </div>

      <div className="spacer" />

      <div className="row">
        <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
          <h3 style={{ marginTop: 0 }}>1) Subscription</h3>
          <p className="small">Required to create deposit links.</p>
          <button className="primary" onClick={subscribe}>
            Subscribe / Manage billing
          </button>
        </div>

        <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
          <h3 style={{ marginTop: 0 }}>2) Stripe account</h3>

          <p className="small">
            {connectReady
              ? "Stripe is connected. Manage payouts and refunds in your Stripe Dashboard."
              : "You are the merchant of record for guest payments."}
          </p>

          <button className="primary" onClick={connectReady ? manageConnect : startConnect}>
            {connectReady ? "Manage Stripe account" : "Start Stripe onboarding"}
          </button>
        </div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
        <h3 style={{ marginTop: 0 }}>3) Create reservation link</h3>
        <p className="small">
          {gatingMessage ? (
            <span style={{ color: "var(--danger)" }}>{gatingMessage}</span>
          ) : (
            <span>Ready ✅</span>
          )}
        </p>

        {/* ✅ Avoid nesting <a><button/></a> (interactive inside interactive) */}
        <a
          href={Boolean(gatingMessage) ? undefined : "/vendor/reservations/new"}
          onClick={(e) => {
            if (gatingMessage) e.preventDefault();
          }}
        >
          <button className="primary" disabled={Boolean(gatingMessage)}>
            Create new reservation
          </button>
        </a>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      <div className="spacer" />

      <h3>Recent reservations</h3>

      {/* ✅ Desktop/tablet table (mobile hides this via CSS) */}
      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Date</th>
              <th>Name</th>
              <th>Party</th>
              <th>Deposit</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {rs.map((r: any) => (
              <tr key={r.id}>
                <td>{r.status}</td>
                <td>{formatDateSafe(r.datetime_iso)}</td>
                <td>{r.customer_name || "—"}</td>
                <td>{r.party_size}</td>
                <td>{formatEUR(r.deposit_cents)}</td>
                <td>
                  <a href={`/r/${r.id}`} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </td>
              </tr>
            ))}

            {rs.length === 0 ? (
              <tr>
                <td colSpan={6} className="small">
                  No reservations yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ✅ Mobile-friendly cards (CSS shows this only on small screens) */}
      <div className="resCards">
        {rs.length === 0 ? (
          <div className="small">No reservations yet.</div>
        ) : (
          rs.map((r: any) => (
            <div key={r.id} className="resCard">
              <div className="resTop">
                <span className={r.status === "PAID" ? "badge ok" : "badge"}>
                  <span className="dot" />
                  {r.status}
                </span>
                <a href={`/r/${r.id}`} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>

              <div className="resGrid">
                <div>
                  <div className="small">
                    <b>Date</b>
                  </div>
                  <div className="small">{formatDateSafe(r.datetime_iso)}</div>
                </div>

                <div>
                  <div className="small">
                    <b>Deposit</b>
                  </div>
                  <div className="small">{formatEUR(r.deposit_cents)}</div>
                </div>

                <div>
                  <div className="small">
                    <b>Name</b>
                  </div>
                  <div className="small">{r.customer_name || "—"}</div>
                </div>

                <div>
                  <div className="small">
                    <b>Party</b>
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
