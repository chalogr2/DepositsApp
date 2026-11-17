"use client";
import { useEffect, useState } from "react";
import { toDatetimeLocalValue } from "@/lib/datetime";
import { MAX_DEPOSIT_CENTS, MIN_DEPOSIT_CENTS } from "@/lib/config";

export default function NewReservationClient({ restaurantId, blocked }: { restaurantId: string; blocked: boolean }) {
  const [customerName, setCustomerName] = useState("Juan Pérez");
  // Default "tomorrow, same time" in the BROWSER's local time. Computed after
  // mount: during server rendering the clock/timezone is the server's (UTC),
  // which caused both the 1 h offset and a hydration mismatch.
  // (Old code: new Date(...).toISOString().slice(0, 16), which is UTC wall-clock time.)
  const [datetimeISO, setDatetimeISO] = useState("");
  useEffect(() => {
    setDatetimeISO((cur) => cur || toDatetimeLocalValue(new Date(Date.now() + 86400000)));
  }, []);
  const [partySize, setPartySize] = useState(2);
  const [depositEUR, setDepositEUR] = useState(10);
  const [policyText, setPolicyText] = useState(
`El depósito es reembolsable si se cancela con 24h+ de antelación a la hora de la reserva.
Si no te presentas, el depósito podrá retenerse para cubrir costes.
El depósito se aplicará a la cuenta final cuando asistas.`
  );
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    // new Date("").toISOString() throws a RangeError, so validate first
    if (!datetimeISO || Number.isNaN(new Date(datetimeISO).getTime())) {
      return setErr("Introduce una fecha y hora válidas.");
    }
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
    if (!res.ok) return setErr(data?.error ?? "Error");
    alert(`Comparte este enlace:\n${data.customerUrl}`);
    window.location.href = "/vendor";
  }

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Crear enlace de reserva</h1>
      {blocked ? (
        <p className="small" style={{ color: "var(--danger)" }}>
          Debes tener una suscripción activa y Stripe conectado antes de crear enlaces.
          Vuelve al <a href="/vendor">panel</a>.
        </p>
      ) : null}

      <div className="row">
        <div><label>Nombre del cliente</label><input value={customerName} onChange={e => setCustomerName(e.target.value)} /></div>
        <div><label>Fecha y hora</label><input type="datetime-local" value={datetimeISO} onChange={e => setDatetimeISO(e.target.value)} /></div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div><label>Comensales</label><input type="number" min={1} value={partySize} onChange={e => setPartySize(parseInt(e.target.value || "1", 10))} /></div>
        <div><label>Depósito (EUR)</label><input type="number" min={MIN_DEPOSIT_CENTS / 100} max={MAX_DEPOSIT_CENTS / 100} step={0.5} value={depositEUR} onChange={e => setDepositEUR(parseFloat(e.target.value || "0"))} />
          {/* Hint only; the API enforces the same limits (lib/config.ts) */}
          <div className="small">Entre €{(MIN_DEPOSIT_CENTS / 100).toFixed(2)} y €{(MAX_DEPOSIT_CENTS / 100).toFixed(2)}</div></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label>Texto de la política</label>
        <textarea value={policyText} onChange={e => setPolicyText(e.target.value)} />
      </div>

      <div className="hstack" style={{ marginTop: 12 }}>
        <button className="primary" onClick={create} disabled={blocked}>Crear enlace</button>
        <a className="small" href="/vendor">Cancelar</a>
      </div>

      {err ? <p className="small" style={{ color: "var(--danger)" }}>{err}</p> : null}
    </main>
  );
}
