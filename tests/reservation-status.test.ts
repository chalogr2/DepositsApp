import { describe, expect, it } from "vitest";
import { allowedActions, effectiveStatus, isPositiveStatus, statusLabel } from "@/lib/reservation-status";

// Fixed clock so the tests never depend on when they run
const NOW = new Date("2026-11-17T20:00:00.000Z");
const PAST = "2026-11-17T19:00:00.000Z";
const FUTURE = "2026-11-18T19:00:00.000Z";
const r = (status: string, datetime_iso: string, refunded_at: string | null = null) => ({ status, datetime_iso, refunded_at });

describe("effectiveStatus (lazy expiry)", () => {
  it("an unpaid link whose time has passed counts as EXPIRED", () => {
    expect(effectiveStatus(r("PENDING", PAST), NOW)).toBe("EXPIRED");
  });
  it("an unpaid link in the future is still PENDING", () => {
    expect(effectiveStatus(r("PENDING", FUTURE), NOW)).toBe("PENDING");
  });
  it("never expires a paid reservation", () => {
    expect(effectiveStatus(r("PAID", PAST), NOW)).toBe("PAID");
  });
});

describe("allowedActions", () => {
  it.each([
    ["PENDING", FUTURE, ["cancel"]],
    ["PENDING", PAST, []], // expired: final
    ["PAID", FUTURE, ["cancel"]], // can't attend / no-show before the time
    ["PAID", PAST, ["attended", "no_show", "cancel"]],
    ["NO_SHOW", PAST, ["attended", "cancel"]],
    ["ATTENDED", PAST, ["no_show"]],
    ["CANCELED", FUTURE, []],
    ["EXPIRED", PAST, []],
  ])("%s with reservation %s → %j", (status, when, expected) => {
    expect(allowedActions(r(status, when), NOW)).toEqual(expected);
  });

  it("attended / no-show unlock exactly at the reservation time, not a second before", () => {
    const at = NOW.toISOString();
    const oneSecondLater = new Date(NOW.getTime() + 1000).toISOString();
    expect(allowedActions(r("PAID", oneSecondLater), NOW)).toEqual(["cancel"]);
    expect(allowedActions(r("PAID", at), NOW)).toEqual(["attended", "no_show", "cancel"]);
  });

  it("garbage dates never unlock time-based actions", () => {
    expect(allowedActions(r("PAID", "not-a-date"), NOW)).toEqual(["cancel"]);
  });
});

describe("labels", () => {
  it("marks refunds", () => {
    expect(statusLabel(r("CANCELED", FUTURE, "2026-11-17T10:00:00Z"), NOW)).toBe("✖ CANCELADA · reembolsado");
  });
  it("green badge only while the restaurant keeps the money", () => {
    expect(isPositiveStatus(r("ATTENDED", PAST), NOW)).toBe(true);
    expect(isPositiveStatus(r("ATTENDED", PAST, "2026-11-17T21:00:00Z"), NOW)).toBe(false);
    expect(isPositiveStatus(r("PENDING", FUTURE), NOW)).toBe(false);
  });
});
