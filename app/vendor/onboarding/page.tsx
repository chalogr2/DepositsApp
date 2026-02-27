"use client";
import { useState } from "react";

export default function VendorOnboardingPage() {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/vendor/restaurant/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error ?? "No se pudo guardar");
        return;
      }

      window.location.href = "/vendor";
    } catch (e: any) {
      setErr(e?.message ?? "La solicitud falló");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Configura tu restaurante</h1>
      <p className="small">Este paso es único. Podrás cambiar el nombre más adelante.</p>

      <label>Nombre del restaurante</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., La Tasca del Born"
      />

      <div className="hstack" style={{ marginTop: 12 }}>
        <button className="primary" onClick={save} disabled={saving || name.trim().length < 2}>
          {saving ? "Guardando..." : "Guardar y continuar"}
        </button>
        <a className="small" href="/vendor">Volver</a>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}
    </main>
  );
}
