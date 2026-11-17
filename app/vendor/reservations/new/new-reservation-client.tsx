"use client";
import { useEffect, useState } from "react";
import { formatReservationDate, toDatetimeLocalValue } from "@/lib/datetime";
import { MAX_DEPOSIT_CENTS, MIN_DEPOSIT_CENTS } from "@/lib/config";
import { formatEUR, parseEurosToCents } from "@/lib/money";

const DEFAULT_POLICY = `El depósito es reembolsable si se cancela con 24h+ de antelación a la hora de la reserva.
Si no te presentas, el depósito podrá retenerse para cubrir costes.
El depósito se aplicará a la cuenta final cuando asistas.`;

// parseEurosToCents lives in lib/money.ts so it can be unit-tested
const eur = formatEUR;

type Created = { url: string; customerName: string; datetimeISO: string; depositCents: number };

export default function NewReservationClient({
  restaurantId,
  restaurantName,
  blocked,
}: {
  restaurantId: string;
  restaurantName: string;
  blocked: boolean;
}) {
  // Was prefilled with "Juan Pérez", which got sent as a real name when the
  // restaurant forgot to change it. Now empty with a placeholder.
  const [customerName, setCustomerName] = useState("");
  // Default "tomorrow, same time" in the BROWSER's local time, set after mount
  // (the server's clock/timezone is UTC; see lib/datetime.ts).
  const [datetimeISO, setDatetimeISO] = useState("");
  useEffect(() => {
    setDatetimeISO((cur) => cur || toDatetimeLocalValue(new Date(Date.now() + 86400000)));
  }, []);
  // Number fields are kept as the TEXT the user typed. Before, they were stored
  // as numbers (`parseFloat(value || "0")`), so clearing the field instantly
  // put a "0" back and it could never be empty. Now empty is allowed and the
  // value is only converted (and validated) on submit.
  const [partySize, setPartySize] = useState("2");
  const [depositEUR, setDepositEUR] = useState("10");
  const [policyText, setPolicyText] = useState(DEFAULT_POLICY);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  async function create() {
    setErr(null);

    // Client-side checks give instant feedback. The API enforces the same
    // rules (reservations/create/route.ts), so these are just for comfort.
    if (!datetimeISO || Number.isNaN(new Date(datetimeISO).getTime())) {
      return setErr("Introduce una fecha y hora válidas.");
    }
    const depositCents = parseEurosToCents(depositEUR); // empty -> 0
    if (depositCents < MIN_DEPOSIT_CENTS) {
      return setErr(`El depósito mínimo es ${eur(MIN_DEPOSIT_CENTS)}.`);
    }
    if (depositCents > MAX_DEPOSIT_CENTS) {
      return setErr(`El depósito máximo es ${eur(MAX_DEPOSIT_CENTS)}.`);
    }
    const party = Number.parseInt(partySize, 10);
    if (!Number.isInteger(party) || party < 1) {
      return setErr("Indica el número de comensales (mínimo 1).");
    }

    // Disables the button while saving: a double click used to create two links
    setSaving(true);
    try {
      const iso = new Date(datetimeISO).toISOString();
      const res = await fetch("/api/vendor/reservations/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId, customerName, datetimeISO: iso, partySize: party, depositCents, policyText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErr(data?.error ?? "Error");
      // Was: alert(link) + redirect. Now a result screen with copy/WhatsApp.
      setCreated({ url: data.customerUrl, customerName: customerName.trim(), datetimeISO: iso, depositCents });
    } finally {
      setSaving(false);
    }
  }

  function startOver() {
    setCreated(null);
    setCustomerName("");
    setErr(null);
  }

  if (created) {
    return <CreatedLink created={created} restaurantName={restaurantName} onAnother={startOver} />;
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
        <div>
          <label>Nombre del cliente</label>
          <input value={customerName} placeholder="Ej.: María García" maxLength={120} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
        <div>
          <label>Fecha y hora</label>
          <input type="datetime-local" value={datetimeISO} onChange={(e) => setDatetimeISO(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Comensales</label>
          <input inputMode="numeric" value={partySize} placeholder="2" onChange={(e) => setPartySize(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label>Depósito (EUR)</label>
          {/* type="text" + inputMode="decimal": allows empty and "10,50";
              type="number" rejects the comma in some browsers. */}
          <input inputMode="decimal" value={depositEUR} placeholder="10,00" onChange={(e) => setDepositEUR(e.target.value.replace(/[^\d.,]/g, ""))} />
          <div className="small">
            Entre {eur(MIN_DEPOSIT_CENTS)} y {eur(MAX_DEPOSIT_CENTS)}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label>Texto de la política</label>
        <textarea value={policyText} maxLength={2000} onChange={(e) => setPolicyText(e.target.value)} />
      </div>

      <div className="hstack" style={{ marginTop: 12 }}>
        <button className="primary" onClick={create} disabled={blocked || saving}>
          {saving ? "Creando…" : "Crear enlace"}
        </button>
        <a className="small" href="/vendor">Cancelar</a>
      </div>

      {err ? <p className="small" style={{ color: "var(--danger)" }}>{err}</p> : null}
    </main>
  );
}

/** Result screen: the link, ready to copy or send by WhatsApp. */
function CreatedLink({ created, restaurantName, onAnother }: { created: Created; restaurantName: string; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);

  const greeting = created.customerName ? `Hola ${created.customerName}, ` : "Hola, ";
  const message =
    `${greeting}para confirmar tu reserva en ${restaurantName} el ${formatReservationDate(created.datetimeISO)}, ` +
    `paga el depósito de ${eur(created.depositCents)} aquí: ${created.url}`;
  // wa.me without a phone number opens WhatsApp and lets the user pick the chat
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. non-HTTPS): the input below is selectable by hand
    }
  }

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Enlace creado ✅</h1>
      <p className="small">Envíalo a tu cliente. La reserva aparecerá como PAGADA en tu panel en cuanto pague.</p>

      <label>Enlace de pago</label>
      <input readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} />

      <div className="hstack" style={{ marginTop: 12 }}>
        <button className="primary" onClick={copy}>{copied ? "¡Copiado!" : "Copiar enlace"}</button>
        <a href={whatsappUrl} target="_blank" rel="noreferrer">
          <button type="button">Enviar por WhatsApp</button>
        </a>
      </div>

      <div className="hstack" style={{ marginTop: 16 }}>
        <button type="button" onClick={onAnother}>Crear otro enlace</button>
        <a className="small" href="/vendor">Volver al panel</a>
      </div>
    </main>
  );
}
