import { describe, expect, it } from "vitest";
import { isSubscriptionActive, subscriptionLabel } from "@/lib/subscription";

const NOW = new Date("2026-11-17T12:00:00Z");

describe("isSubscriptionActive", () => {
  it("active with a future period end", () => {
    expect(isSubscriptionActive({ subscription_status: "active", subscription_current_period_end: "2026-12-17T12:00:00Z" }, NOW)).toBe(true);
  });
  it("trialing counts as active (same rule as admin)", () => {
    expect(isSubscriptionActive({ subscription_status: "trialing", subscription_current_period_end: "2026-12-01T00:00:00Z" }, NOW)).toBe(true);
  });
  it('"active" in the DB but the period is over → not active (the stale-badge bug)', () => {
    const r = { subscription_status: "active", subscription_current_period_end: "2026-11-01T00:00:00Z" };
    expect(isSubscriptionActive(r, NOW)).toBe(false);
    expect(subscriptionLabel(r, NOW)).toBe("caducada");
  });
  it.each(["past_due", "canceled", "inactive", null])("%s → not active", (status) => {
    expect(isSubscriptionActive({ subscription_status: status }, NOW)).toBe(false);
  });
});
