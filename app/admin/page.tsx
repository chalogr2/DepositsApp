"use client";
import { useEffect, useState } from "react";
import { subscriptionLabel } from "@/lib/subscription";
import { formatReservationDate } from "@/lib/datetime";

type AnyRow = Record<string, any>;

export default function AdminPage() {
  const [restaurants, setRestaurantes] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="card">
      <div className="hstack" style={{ justifyContent: "space-between" }}>
        <h1 style={{ marginTop: 0 }}>Restaurantes</h1>
        <button onClick={load} disabled={loading}>
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      {/* Was titled "activos" and claimed to filter by status, but the API
          returns ALL restaurants. Now it says so and shows a count instead. */}
      <p className="small">
        {restaurants.length} restaurantes · {restaurants.filter((r) => r.is_active).length} con suscripción activa.
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
              <td>
                <span className={r.is_active ? "badge ok" : "badge bad"}>
                  <span className="dot" />
                  {subscriptionLabel(r)}
                </span>
              </td>
              <td>{r.subscription_current_period_end ? formatReservationDate(r.subscription_current_period_end, "short") : "—"}</td>
            </tr>
          ))}

          {!loading && (restaurants ?? []).length === 0 ? (
            <tr>
              <td colSpan={6} className="small">
                Aún no hay restaurantes.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
