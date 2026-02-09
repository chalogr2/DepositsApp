import { supabaseAdmin } from "@/lib/supabase/admin";
import PayButton from "./pay-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function statusLabel(raw: unknown) {
  const s = String(raw ?? "").toUpperCase();

  switch (s) {
    case "PAID":
      return "✅ PAGADO";
    case "PENDING":
      return "❌ PENDIENTE";
    case "CANCELED":
      return "❌ CANCELADO";
    case "EXPIRED":
      return "❌ EXPIRADA";
    default:
      return s || "—";
  }
}

export default async function ReservaPage({ params }: { params: { id: string } }) {
  const admin = supabaseAdmin();

  const { data: reservation } = await admin
    .from("reservations")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!reservation) {
    return (
      <main className="card">
        <h1 style={{ marginTop: 0 }}>Reserva no encontrada</h1>
        <p className="small">Enlace inválido.</p>
      </main>
    );
  }

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("name")
    .eq("id", reservation.restaurant_id)
    .single();

  // Normalize status to avoid case mismatches ("PAID" vs "paid")
  const status = String(reservation.status ?? "").toLowerCase();
  const isPagado = status === "paid";

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Confirma tu reserva</h1>

      <div className="hstack">
        <span className={isPagado ? "badge ok" : "badge"}>
          <span className="dot" />
          Estado: {statusLabel(reservation.status)}
        </span>

        <span className="badge">
          <span className="dot" />
          Restaurante: {restaurant?.name ?? "—"}
        </span>

        <span className="badge">
          <span className="dot" />
          Comensales: {reservation.party_size}
        </span>

        <span className="badge">
          <span className="dot" />
          Depósito: €{(reservation.deposit_cents / 100).toFixed(2)}
        </span>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <div className="small">
            <b>Nombre</b>
          </div>
          <div className="small">{reservation.customer_name || "—"}</div>
        </div>
        <div>
          <div className="small">
            <b>Fecha y hora</b>
          </div>
          <div className="small">{reservation.datetime_iso}</div>
        </div>
      </div>

      <div className="spacer" />

      <div>
        <div className="small">
          <b>Política de reembolso</b>
        </div>
        <div className="small" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
          {reservation.policy_text}
        </div>
      </div>

      <div className="spacer" />

      {isPagado ? (
        <p className="small">Ya está pagado ✅</p>
      ) : (
        <PayButton reservationId={reservation.id} />
      )}

      <div className="spacer" />
      <p className="small">Los reembolsos los gestiona el restaurante y vuelven a la tarjeta original.</p>
    </main>
  );
}
