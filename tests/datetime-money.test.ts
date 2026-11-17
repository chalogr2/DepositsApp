import { describe, expect, it } from "vitest";
import { formatReservationDate } from "@/lib/datetime";
import { parseEurosToCents } from "@/lib/money";

describe("formatReservationDate (stored UTC, shown in Madrid)", () => {
  it("winter: UTC+1", () => {
    expect(formatReservationDate("2026-11-18T19:30:00.000Z", "short")).toContain("20:30");
  });
  it("summer: UTC+2", () => {
    expect(formatReservationDate("2026-07-18T19:30:00.000Z", "short")).toContain("21:30");
  });
  it("never throws on bad data", () => {
    expect(formatReservationDate("garbage")).toBe("garbage");
  });
});

describe("parseEurosToCents", () => {
  it.each([
    ["10", 1000],
    ["10,50", 1050], // Spanish decimal comma
    ["10.5", 1050],
    ["0.1", 10], // float rounding: 0.1 * 100 = 10.000000000000002
    ["", 0], // empty field allowed → becomes 0 → "minimum €0.50" message
    ["abc", 0],
  ])("%j → %i cents", (input, cents) => {
    expect(parseEurosToCents(input)).toBe(cents);
  });
});
