"use client";
import { useState } from "react";

export default function PayButton({ reservationId }: { reservationId: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/guest/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reservationId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error");
      window.location.href = data.url;
    } catch (e: any) {
      setErr(e.message ?? "Error"); setLoading(false);
    }
  }

  return (
    <div className="hstack">
      <button className="primary" onClick={pay} disabled={loading}>{loading ? "Redirigiendo…" : "Pagar depósito"}</button>
      {err ? <span className="small" style={{ color: "var(--danger)" }}>{err}</span> : null}
    </div>
  );
}
