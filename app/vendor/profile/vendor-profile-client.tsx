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

    if (trimmed.length < 2) return setErr("Restaurant name is too short.");
    if (trimmed.length > 80) return setErr("Restaurant name is too long (max 80 chars).");

    setSaving(true);
    try {
      const res = await fetch("/api/vendor/restaurant/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErr(data?.error ?? "Failed to update name");

      // Return to portal after successful save
      window.location.href = "/vendor";
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update name");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="card">
      <div className="hstack" style={{ justifyContent: "space-between" }}>
        <h1 style={{ marginTop: 0 }}>Edit restaurant</h1>
        <a href="/vendor" className="small">
          <button type="button">Back</button>
        </a>
      </div>

      <label>Restaurant name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant name" />

      <div className="hstack" style={{ marginTop: 12 }}>
        <button className="primary" onClick={save} disabled={!changed || saving}>
          {saving ? "Saving..." : "Save changes"}
        </button>
        <a className="small" href="/vendor">
          Cancel
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