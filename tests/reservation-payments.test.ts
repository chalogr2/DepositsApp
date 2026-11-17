import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * markReservationPaidFromSession is the ONLY code that turns a reservation
 * into PAID, so it's the security boundary for guest payments. These tests run
 * it against a tiny in-memory stand-in for Supabase, so they need no network
 * and no real database.
 */

// ---- minimal fake of the Supabase query builder used by the function -------
type Row = Record<string, any>;
let db: Record<string, Row[]>;

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const rows = () => db[table].filter((r) => filters.every((f) => f(r)));
  const q: any = {
    select: () => q,
    update: (p: Row) => ((patch = p), q),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    // awaiting the builder itself runs the update (or a list select)
    then: (resolve: (v: unknown) => void) => {
      if (!patch) return resolve({ data: rows(), error: null });
      const matched = rows();
      matched.forEach((r) => Object.assign(r, patch));
      resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
    },
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ from }) }));
const { markReservationPaidFromSession } = await import("@/lib/reservation-payments");

// ---- fixtures ---------------------------------------------------------------
const RID = "res-1";
const ACCT = "acct_restaurant";

beforeEach(() => {
  db = {
    restaurants: [{ id: "rest-1", stripe_account_id: ACCT }],
    reservations: [
      { id: RID, restaurant_id: "rest-1", status: "PENDING", deposit_cents: 1000, stripe_payment_intent_id: null },
      { id: "res-2", restaurant_id: "rest-1", status: "PENDING", deposit_cents: 5000, stripe_payment_intent_id: null },
    ],
  };
});

const session = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: "cs_1",
    mode: "payment",
    payment_status: "paid",
    amount_total: 1000,
    currency: "eur",
    payment_intent: "pi_1",
    metadata: { reservation_id: RID },
    ...over,
  }) as Stripe.Checkout.Session;

const status = (id = RID) => db.reservations.find((r) => r.id === id)!.status;

// ---- tests --------------------------------------------------------------------
describe("markReservationPaidFromSession", () => {
  it("marks a valid payment as PAID and stores the Stripe ids", async () => {
    expect(await markReservationPaidFromSession(session(), ACCT, RID)).toEqual({ ok: true, alreadyPaid: false });
    const row = db.reservations[0];
    expect(row.status).toBe("PAID");
    expect(row.stripe_payment_intent_id).toBe("pi_1");
    expect(row.stripe_checkout_session_id).toBe("cs_1");
  });

  it("is idempotent: /success and the webhook can both run", async () => {
    await markReservationPaidFromSession(session(), ACCT, RID);
    expect(await markReservationPaidFromSession(session(), ACCT)).toEqual({ ok: true, alreadyPaid: true });
  });

  describe("rejects (and changes nothing)", () => {
    it("a €10 payment replayed against a €50 reservation (URL rid swapped)", async () => {
      const res = await markReservationPaidFromSession(session(), ACCT, "res-2");
      expect(res).toMatchObject({ ok: false, httpStatus: 409 });
      expect(status("res-2")).toBe("PENDING");
    });

    it("a session from another Stripe account", async () => {
      expect(await markReservationPaidFromSession(session(), "acct_attacker", RID)).toMatchObject({ ok: false });
      expect(status()).toBe("PENDING");
    });

    it.each([
      ["wrong amount", { amount_total: 50 }],
      ["wrong currency", { currency: "usd" }],
      ["not paid yet", { payment_status: "unpaid" as const }],
      ["a subscription session", { mode: "subscription" as const }],
      ["no reservation in metadata", { metadata: {} }],
    ])("%s", async (_, over) => {
      expect(await markReservationPaidFromSession(session(over), ACCT, RID)).toMatchObject({ ok: false });
      expect(status()).toBe("PENDING");
    });
  });

  describe("lifecycle interactions", () => {
    it("a late payment on an EXPIRED link still counts (the money is real)", async () => {
      db.reservations[0].status = "EXPIRED";
      expect(await markReservationPaidFromSession(session(), ACCT, RID)).toEqual({ ok: true, alreadyPaid: false });
      expect(status()).toBe("PAID");
    });

    it("a late webhook for an already-ATTENDED reservation is recognised, not flagged", async () => {
      Object.assign(db.reservations[0], { status: "ATTENDED", stripe_payment_intent_id: "pi_1" });
      expect(await markReservationPaidFromSession(session(), ACCT)).toEqual({ ok: true, alreadyPaid: true });
      expect(status()).toBe("ATTENDED");
    });

    it("a payment on a CANCELED reservation is flagged for manual review, not resurrected", async () => {
      db.reservations[0].status = "CANCELED";
      const res = await markReservationPaidFromSession(session(), ACCT, RID);
      expect(res).toMatchObject({ ok: false, httpStatus: 409 });
      expect(status()).toBe("CANCELED");
    });
  });
});
