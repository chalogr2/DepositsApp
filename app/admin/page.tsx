"use client";
import { useEffect, useState } from "react";

type AnyRow = Record<string, any>;

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const [restaurants, setRestaurants] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function login() {
    setErr(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErr(data?.error ?? "Login failed");
      setAuthed(true);
    } catch (e: any) {
      setErr(e?.message ?? "Login request failed");
    }
  }

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      // cache: "no-store" avoids any caching surprises
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(data?.error ?? "Failed to load");
        setRestaurants([]);
        return;
      }

      setRestaurants(Array.isArray(data?.restaurants) ? data.restaurants : []);
    } catch (e: any) {
      setErr(e?.message ?? "Fetch failed");
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (!authed) {
    return (
      <main className="card">
        <h1 style={{ marginTop: 0 }}>Admin</h1>
        <p className="small">
          Demo password from <code>.env</code>.
        </p>

        <div className="row">
          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button className="primary" onClick={login}>
              Login
            </button>
          </div>
        </div>

        {err ? (
          <p className="small" style={{ color: "var(--danger)" }}>
            {err}
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="card">
      <div className="hstack" style={{ justifyContent: "space-between" }}>
        <h1 style={{ marginTop: 0 }}>Active restaurants</h1>
        <button onClick={load} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      <p className="small">
        Showing restaurants with <code>subscription_status = "active"</code>.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Stripe acct</th>
            <th>Stripe ready</th>
            <th>Sub</th>
            <th>Period end</th>
          </tr>
        </thead>
        <tbody>
          {(restaurants ?? []).map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                <code>{r.owner_user_id}</code>
              </td>
              <td>
                <code>{r.stripe_account_id ?? "—"}</code>
              </td>
              <td>{String(r.stripe_onboarding_complete)}</td>
              <td>{r.subscription_status}</td>
              <td>{r.subscription_current_period_end ?? "—"}</td>
            </tr>
          ))}

          {(restaurants ?? []).length === 0 ? (
            <tr>
              <td colSpan={6} className="small">
                No active restaurants yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
