"use client";
import { useMemo, useState } from "react";

export default function VendorProfileClient({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmed = useMemo(() => String(name ?? "").trim(), [name]);
  const changed = trimmed !== String(initialName ?? "").trim();

  async function save() {
    setErr(null);

    if (trimmed.length < 2) return setErr("El nombre del restaurante es demasiado corto.");
    if (trimmed.length > 80) return setErr("El nombre del restaurante es demasiado largo (máx. 80 caracteres).");

    setSaving(true);
    try {
      const res = await fetch("/api/vendor/restaurant/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErr(data?.error ?? "No se pudo actualizar el nombre");

      // Return to portal after successful save
      window.location.href = "/vendor";
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo actualizar el nombre");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="card">
      <div className="hstack" style={{ justifyContent: "space-between" }}>
        <h1 style={{ marginTop: 0 }}>Editar restaurante</h1>
        <a href="/vendor" className="small">
          <button type="button">Volver</button>
        </a>
      </div>

      <label>Nombre del restaurante</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del restaurante" />

      <div className="hstack" style={{ marginTop: 12 }}>
        <button className="primary" onClick={save} disabled={!changed || saving}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        <a className="small" href="/vendor">
          Cancelar
        </a>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}
    </main>
  );
}