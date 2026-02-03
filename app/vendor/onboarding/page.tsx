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
      const res = await fetch("/api/vendor/restaurant/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error ?? "Failed to save");
        return;
      }

      window.location.href = "/vendor";
    } catch (e: any) {
      setErr(e?.message ?? "Request failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Set up your restaurant</h1>
      <p className="small">This is a one-time step. You can rename it later.</p>

      <label>Restaurant name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., La Tasca del Born"
      />

      <div className="hstack" style={{ marginTop: 12 }}>
        <button className="primary" onClick={save} disabled={saving || name.trim().length < 2}>
          {saving ? "Saving..." : "Continue"}
        </button>
        <a className="small" href="/vendor">Back</a>
      </div>

      {err ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}
    </main>
  );
}
