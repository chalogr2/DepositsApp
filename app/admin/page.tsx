"use client";
import { useEffect, useState } from "react";

type AnyRow = Record<string, any>;

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setContraseña] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const [restaurants, setRestaurantes] = useState<AnyRow[]>([]);
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
      if (!res.ok) return setErr(data?.error ?? "Inicio de sesión fallido");
      setAuthed(true);
    } catch (e: any) {
      setErr(e?.message ?? "La solicitud de inicio de sesión falló");
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
        setErr(data?.error ?? "No se pudo cargar");
        setRestaurantes([]);
        return;
      }

      setRestaurantes(Array.isArray(data?.restaurants) ? data.restaurants : []);
    } catch (e: any) {
      setErr(e?.message ?? "La solicitud falló");
      setRestaurantes([]);
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
          Contraseña de demo en <code>.env</code>.
        </p>

        <div className="row">
          <div>
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setContraseña(e.target.value)}
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
        <h1 style={{ marginTop: 0 }}>Restaurantes activos</h1>
        <button onClick={load} disabled={loading}>
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      <p className="small">
        Mostrando restaurantes con <code>subscription_status = active</code>.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Propietario</th>
            <th>Cuenta Stripe</th>
            <th>Stripe listo</th>
            <th>Suscripción</th>
            <th>Fin de periodo</th>
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
                Aún no hay restaurantes activos.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
