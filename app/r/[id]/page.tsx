import { supabaseAdmin } from "@/lib/supabase/admin";
import PayButton from "./pay-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function ReservationPage({ params }: { params: { id: string } }) {
  const admin = supabaseAdmin();

  const { data: reservation } = await admin
    .from("reservations")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!reservation) {
    return (
      <main className="card">
        <h1 style={{ marginTop: 0 }}>Reservation not found</h1>
        <p className="small">Invalid link.</p>
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
  const isPaid = status === "paid";

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Confirm your reservation</h1>

      <div className="hstack">
        <span className={isPaid ? "badge ok" : "badge"}>
          <span className="dot" />
          Status: {String(reservation.status ?? "")}
        </span>

        <span className="badge">
          <span className="dot" />
          Restaurant: {restaurant?.name ?? "—"}
        </span>

        <span className="badge">
          <span className="dot" />
          Party: {reservation.party_size}
        </span>

        <span className="badge">
          <span className="dot" />
          Deposit: €{(reservation.deposit_cents / 100).toFixed(2)}
        </span>
      </div>

      <div className="spacer" />

      <div className="row">
        <div>
          <div className="small">
            <b>Name</b>
          </div>
          <div className="small">{reservation.customer_name || "—"}</div>
        </div>
        <div>
          <div className="small">
            <b>Date & time</b>
          </div>
          <div className="small">{reservation.datetime_iso}</div>
        </div>
      </div>

      <div className="spacer" />

      <div>
        <div className="small">
          <b>Refund policy</b>
        </div>
        <div className="small" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
          {reservation.policy_text}
        </div>
      </div>

      <div className="spacer" />

      {isPaid ? <p className="small">Already paid ✅</p> : <PayButton reservationId={reservation.id} />}

      <div className="spacer" />
      <p className="small">Refunds are issued by the restaurant and return to the original card.</p>
    </main>
  );
}