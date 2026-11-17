// SERVER-ONLY: uses the Stripe secret key and the Supabase service-role key.
// Never import this from a "use client" component.
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripePlatform, asConnectedAccount } from "@/lib/stripe";
import { markReservationPaidFromSession } from "@/lib/reservation-payments";
import {
  ACTION_TARGET,
  allowedActions,
  effectiveStatus,
  hasReservationTimePassed,
  type ReservationAction,
} from "@/lib/reservation-status";

// ---------------------------------------------------------------------------
// Auto-expire (lazy, no cron)
// ---------------------------------------------------------------------------

/**
 * PENDING reservations whose time has passed become EXPIRED.
 *
 * There is no background job (an MVP on Vercel has no always-on worker), so
 * this runs whenever the server is about to show or use reservations: the
 * dashboard load, the guest page and the guest checkout. Between those moments
 * the UI uses effectiveStatus() and already shows EXPIRADA.
 *
 * The update is conditional on status = PENDING, so it can never overwrite a
 * payment that landed at the same moment.
 */
export async function expireOverdueForRestaurant(restaurantId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { data: pending } = await admin
    .from("reservations")
    .select("id, status, datetime_iso")
    .eq("restaurant_id", restaurantId)
    .eq("status", "PENDING");

  // Compared in JS (Date.parse) instead of SQL: datetime_iso is a text column,
  // and a text comparison is only correct if every row uses the exact same format.
  const overdue = (pending ?? []).filter((r) => hasReservationTimePassed(r)).map((r) => r.id);
  if (!overdue.length) return;

  await admin.from("reservations").update({ status: "EXPIRED" }).in("id", overdue).eq("status", "PENDING");
}

/** Same as above for one reservation. Returns the status after the check. */
export async function expireIfOverdue(r: { id: string; status: string; datetime_iso: string }): Promise<string> {
  if (String(r.status).toUpperCase() !== "PENDING" || !hasReservationTimePassed(r)) return r.status;
  await supabaseAdmin().from("reservations").update({ status: "EXPIRED" }).eq("id", r.id).eq("status", "PENDING");
  return "EXPIRED";
}

// ---------------------------------------------------------------------------
// Restaurant actions: cancel (+refund), no-show, attended
// ---------------------------------------------------------------------------

export type ActionResult =
  | { ok: true; status: string; refunded: boolean }
  | { ok: false; httpStatus: number; error: string };

/**
 * Applies a restaurant action to one of ITS reservations.
 * The caller (API route) has already authenticated the user; ownership is
 * checked here, so this function is safe to reuse from anywhere.
 */
export async function applyReservationAction(params: {
  reservationId: string;
  ownerUserId: string;
  action: ReservationAction;
}): Promise<ActionResult> {
  const admin = supabaseAdmin();

  const { data: reservation } = await admin
    .from("reservations")
    .select("id, restaurant_id, status, datetime_iso, deposit_cents, stripe_payment_intent_id, refunded_at")
    .eq("id", params.reservationId)
    .maybeSingle();
  if (!reservation) return fail(404, "Reserva no encontrada");

  // Ownership: the reservation's restaurant must belong to the caller.
  // Same "not found" answer either way, so nobody can probe other ids.
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, stripe_account_id")
    .eq("id", reservation.restaurant_id)
    .eq("owner_user_id", params.ownerUserId)
    .maybeSingle();
  if (!restaurant) return fail(404, "Reserva no encontrada");

  // Same rules the dashboard used to decide which buttons to show
  if (!allowedActions(reservation).includes(params.action)) {
    return fail(409, `Esta acción no está disponible para una reserva en estado ${effectiveStatus(reservation)}.`);
  }

  const current = String(reservation.status).toUpperCase();
  const target = ACTION_TARGET[params.action];

  // --- Cancel a PAID / NO_SHOW reservation: refund first, then record it ----
  if (params.action === "cancel" && current !== "PENDING") {
    if (!reservation.stripe_payment_intent_id || !restaurant.stripe_account_id) {
      return fail(409, "No se encontró el pago en Stripe; reembolsa desde tu panel de Stripe.");
    }

    let refund: Stripe.Refund;
    try {
      refund = await stripePlatform().refunds.create(
        { payment_intent: reservation.stripe_payment_intent_id, reason: "requested_by_customer" },
        {
          ...asConnectedAccount(restaurant.stripe_account_id),
          // A double click (or a retry) cannot refund twice: Stripe returns the
          // first refund for the same key.
          idempotencyKey: `refund_res_${reservation.id}`,
        }
      );
    } catch (e: any) {
      // e.g. charge_already_refunded (refunded from the Stripe Dashboard and the
      // webhook hasn't arrived yet), or insufficient balance on the account
      return fail(502, `Stripe no pudo hacer el reembolso: ${e?.message ?? "error desconocido"}`);
    }

    // Unconditional on status on purpose: the money HAS been returned, so
    // CANCELED is now the truth whatever happened to the row meanwhile.
    const { error } = await admin
      .from("reservations")
      .update({ status: "CANCELED", refunded_at: new Date().toISOString(), stripe_refund_id: refund.id })
      .eq("id", reservation.id);
    if (error) {
      // Refund is done; a retry is safe (same idempotency key returns the same refund)
      return fail(500, `Reembolso hecho (${refund.id}) pero no se pudo guardar. Vuelve a intentarlo.`);
    }
    return { ok: true, status: "CANCELED", refunded: true };
  }

  // --- Cancel a PENDING reservation: close the guest's payment page --------
  if (params.action === "cancel") {
    const paidSession = await closeOpenCheckoutSession(reservation.id, restaurant.stripe_account_id);
    if (paidSession) {
      // The guest paid in the last few seconds, before we could close the page.
      // Record the payment (never lose money) and let the restaurant decide.
      await markReservationPaidFromSession(paidSession, restaurant.stripe_account_id!, reservation.id);
      return fail(409, "El cliente acaba de pagar. La reserva está PAGADA; si quieres cancelarla, pulsa Cancelar otra vez para reembolsar.");
    }
  }

  // --- Status-only changes (no money moves) ---------------------------------
  // Conditional on the status we validated: if it changed in between (e.g. the
  // guest paid while the restaurant clicked "Cancelar"), nothing is written.
  const { data: updated, error } = await admin
    .from("reservations")
    .update({ status: target })
    .eq("id", reservation.id)
    .eq("status", current)
    .select("id");
  if (error) return fail(500, `No se pudo actualizar la reserva: ${error.message}`);
  if (!updated?.length) return fail(409, "La reserva cambió mientras tanto. Recarga la página.");

  return { ok: true, status: target, refunded: false };
}

/**
 * Expires the guest's open Stripe Checkout page (if any), so a cancelled
 * reservation can't be paid from a tab the guest still has open.
 *
 * Returns the session if it turned out to be already PAID (the race where the
 * guest paid a second before the restaurant cancelled), otherwise null.
 */
async function closeOpenCheckoutSession(
  reservationId: string,
  stripeAccountId: string | null
): Promise<Stripe.Checkout.Session | null> {
  if (!stripeAccountId) return null;

  const { data: row } = await supabaseAdmin()
    .from("reservation_checkout_sessions")
    .select("stripe_checkout_session_id")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  const sessionId = row?.stripe_checkout_session_id;
  if (!sessionId) return null; // the guest never opened the payment page

  const stripe = stripePlatform();
  const opts = asConnectedAccount(stripeAccountId);
  const session = await stripe.checkout.sessions.retrieve(sessionId, opts);

  if (session.status === "open") {
    try {
      await stripe.checkout.sessions.expire(sessionId, opts);
      return null;
    } catch {
      // Completed between our retrieve and expire: re-read and fall through
      const again = await stripe.checkout.sessions.retrieve(sessionId, opts);
      return again.payment_status === "paid" ? again : null;
    }
  }
  return session.status === "complete" && session.payment_status === "paid" ? session : null;
}

function fail(httpStatus: number, error: string): ActionResult {
  return { ok: false, httpStatus, error };
}
