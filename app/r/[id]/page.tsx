import { supabaseAdmin } from "@/lib/supabase/admin";
import PayButton from "./pay-button";
import { formatReservationDate } from "@/lib/datetime";
import { statusLabel, isPositiveStatus, PAID_STATUSES } from "@/lib/reservation-status";
import { expireIfOverdue } from "@/lib/reservation-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** What the guest sees under the details, depending on the status. */
function GuestFooter({ status, refunded, reservationId }: { status: string; refunded: boolean; reservationId: string }) {
  if (status === "PENDING") return <PayButton reservationId={reservationId} />;
  if (status === "CANCELED") {
    return (
      <p className="small">
        El restaurante ha cancelado esta reserva.
        {refunded ? " El depósito se ha reembolsado a tu tarjeta (puede tardar 5–10 días en aparecer)." : ""}
      </p>
    );
  }
  if (status === "EXPIRED") {
    return <p className="small">Este enlace ha caducado porque la hora de la reserva ya pasó. Contacta con el restaurante.</p>;
  }
  if (PAID_STATUSES.has(status)) return <p className="small">Depósito pagado ✅</p>;
  return null;
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

  // A PENDING link past its reservation time becomes EXPIRED (saved to the DB)
  reservation.status = await expireIfOverdue(reservation);
  const status = String(reservation.status ?? "").toUpperCase();

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Confirma tu reserva</h1>

      <div className="hstack">
        <span className={isPositiveStatus(reservation) ? "badge ok" : "badge"}>
          <span className="dot" />
          Estado: {statusLabel(reservation)}
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
          {/* Was the raw UTC string "2026-11-18T19:30:00.000Z"; now Madrid time */}
          <div className="small">{formatReservationDate(reservation.datetime_iso)}</div>
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

      <GuestFooter status={status} refunded={Boolean(reservation.refunded_at)} reservationId={reservation.id} />

      <div className="spacer" />
      <p className="small">Los reembolsos los gestiona el restaurante y vuelven a la tarjeta original.</p>
    </main>
  );
}
