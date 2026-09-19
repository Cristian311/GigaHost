import { describe, expect, it } from "vitest";
import { prorate } from "./prorate";

const periodStart = new Date("2026-01-01T00:00:00Z");
const periodEnd = new Date("2026-02-01T00:00:00Z"); // 31 days
const halfway = new Date("2026-01-16T12:00:00Z"); // exactly 50 %

describe("prorate", () => {
  it("charges the full difference at the start of the period", () => {
    const result = prorate({
      oldMonthlyCents: 2000,
      newMonthlyCents: 3000,
      months: 1,
      periodStart,
      periodEnd,
      now: periodStart,
    });
    expect(result.remainingFraction).toBe(1);
    expect(result.deltaCents).toBe(1000);
    expect(result.chargeCents).toBe(1000);
    expect(result.creditCents).toBe(0);
  });

  it("charges half the difference halfway through the period", () => {
    const result = prorate({
      oldMonthlyCents: 2000,
      newMonthlyCents: 3000,
      months: 1,
      periodStart,
      periodEnd,
      now: halfway,
    });
    expect(result.remainingFraction).toBeCloseTo(0.5, 5);
    expect(result.chargeCents).toBe(500);
  });

  it("scales by the number of months in the period", () => {
    const yearEnd = new Date("2027-01-01T00:00:00Z");
    const result = prorate({
      oldMonthlyCents: 2000,
      newMonthlyCents: 2500,
      months: 12,
      periodStart,
      periodEnd: yearEnd,
      now: periodStart,
    });
    // 500 cents more per month, 12 months still to run
    expect(result.chargeCents).toBe(6000);
  });

  it("turns a downgrade into a credit and never into a charge", () => {
    const result = prorate({
      oldMonthlyCents: 3000,
      newMonthlyCents: 2000,
      months: 1,
      periodStart,
      periodEnd,
      now: halfway,
    });
    expect(result.deltaCents).toBe(-500);
    expect(result.chargeCents).toBe(0);
    expect(result.creditCents).toBe(500);
  });

  it("charges nothing when the resources do not change", () => {
    const result = prorate({
      oldMonthlyCents: 2500,
      newMonthlyCents: 2500,
      months: 3,
      periodStart,
      periodEnd,
      now: halfway,
    });
    expect(result.deltaCents).toBe(0);
    expect(result.chargeCents).toBe(0);
    expect(result.creditCents).toBe(0);
  });

  it("charges nothing once the period has ended", () => {
    const result = prorate({
      oldMonthlyCents: 2000,
      newMonthlyCents: 9000,
      months: 1,
      periodStart,
      periodEnd,
      now: new Date("2026-03-01T00:00:00Z"),
    });
    expect(result.remainingFraction).toBe(0);
    expect(result.chargeCents).toBe(0);
  });

  it("clamps a clock that is behind the period start", () => {
    const result = prorate({
      oldMonthlyCents: 2000,
      newMonthlyCents: 3000,
      months: 1,
      periodStart,
      periodEnd,
      now: new Date("2025-12-01T00:00:00Z"),
    });
    expect(result.remainingFraction).toBe(1);
    expect(result.chargeCents).toBe(1000);
  });

  it("returns whole cents", () => {
    const result = prorate({
      oldMonthlyCents: 1234,
      newMonthlyCents: 4321,
      months: 3,
      periodStart,
      periodEnd,
      now: new Date("2026-01-09T07:13:00Z"),
    });
    expect(Number.isInteger(result.deltaCents)).toBe(true);
    expect(Number.isInteger(result.chargeCents)).toBe(true);
    expect(Number.isInteger(result.creditCents)).toBe(true);
  });

  it("handles a zero-length period without dividing by zero", () => {
    const result = prorate({
      oldMonthlyCents: 2000,
      newMonthlyCents: 3000,
      months: 1,
      periodStart,
      periodEnd: periodStart,
      now: periodStart,
    });
    expect(result.remainingFraction).toBe(0);
    expect(result.deltaCents).toBe(0);
  });
});
