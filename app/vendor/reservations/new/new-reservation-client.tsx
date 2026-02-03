"use client";
import { useState } from "react";

export default function NewReservationClient({ restaurantId, blocked }: { restaurantId: string; blocked: boolean }) {
  const [customerName, setCustomerName] = useState("John Doe");
  const [datetimeISO, setDatetimeISO] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [partySize, setPartySize] = useState(2);
  const [depositEUR, setDepositEUR] = useState(10);
  const [policyText, setPolicyText] = useState(
`Deposit is refundable if cancelled 24h+ before the reservation time.
If you do not show up, the deposit may be kept to cover costs.
The deposit will be applied to your final bill when you attend.`
  );
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    const res = await fetch("/api/vendor/reservations/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        customerName,
        datetimeISO: new Date(datetimeISO).toISOString(),
        partySize,
        depositCents: Math.round(depositEUR * 100),
        policyText
      })
    });
    const data = await res.json();
    if (!res.ok) return setErr(data?.error ?? "Failed");
    alert(`Share this link:\n${data.customerUrl}`);
    window.location.href = "/vendor";
  }

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Create reservation link</h1>
      {blocked ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          You must have an active subscription and connected Stripe before creating links.
          Go back to <a href="/vendor">dashboard</a>.
        </p>
      ) : null}

      <div className="row">
        <div><label>Guest name</label><input value={customerName} onChange={e => setCustomerName(e.target.value)} /></div>
        <div><label>Date & time</label><input type="datetime-local" value={datetimeISO} onChange={e => setDatetimeISO(e.target.value)} /></div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div><label>Party size</label><input type="number" min={1} value={partySize} onChange={e => setPartySize(parseInt(e.target.value || "1", 10))} /></div>
        <div><label>Deposit (EUR)</label><input type="number" min={0} step={1} value={depositEUR} onChange={e => setDepositEUR(parseFloat(e.target.value || "0"))} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label>Policy text</label>
        <textarea value={policyText} onChange={e => setPolicyText(e.target.value)} />
      </div>

      <div className="hstack" style={{ marginTop: 12 }}>
        <button className="primary" onClick={create} disabled={blocked}>Create link</button>
        <a className="small" href="/vendor">Cancel</a>
      </div>

      {err ? <p className="small" style={{ color: "var(--danger)" }}>{err}</p> : null}
    </main>
  );
}
