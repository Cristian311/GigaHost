import { describe, expect, it } from "vitest";
import { computeNextRun } from "./next-run";

const at = (iso: string) => new Date(iso);

describe("computeNextRun", () => {
  describe("daily", () => {
    const daily = { frequency: "DAILY", minuteOfDayUtc: 5 * 60 } as const; // 05:00 UTC

    it("fires later today when the time has not passed yet", () => {
      expect(computeNextRun(daily, at("2026-03-10T03:30:00Z"))).toEqual(at("2026-03-10T05:00:00Z"));
    });

    it("fires tomorrow once today's slot has passed", () => {
      expect(computeNextRun(daily, at("2026-03-10T05:00:01Z"))).toEqual(at("2026-03-11T05:00:00Z"));
    });

    it("never returns the instant it was asked about", () => {
      // Otherwise a task that runs exactly on time would be due again at once.
      expect(computeNextRun(daily, at("2026-03-10T05:00:00Z"))).toEqual(at("2026-03-11T05:00:00Z"));
    });

    it("rolls over month and year boundaries", () => {
      expect(computeNextRun(daily, at("2026-12-31T23:00:00Z"))).toEqual(at("2027-01-01T05:00:00Z"));
      expect(computeNextRun(daily, at("2028-02-28T06:00:00Z"))).toEqual(at("2028-02-29T05:00:00Z"));
    });
  });

  describe("weekly", () => {
    // Sunday 04:30 UTC. 2026-03-10 is a Tuesday.
    const weekly = { frequency: "WEEKLY", minuteOfDayUtc: 4 * 60 + 30, dayOfWeekUtc: 0 } as const;

    it("finds the next matching weekday", () => {
      expect(computeNextRun(weekly, at("2026-03-10T12:00:00Z"))).toEqual(at("2026-03-15T04:30:00Z"));
    });

    it("fires later the same day when that is the weekday", () => {
      expect(computeNextRun(weekly, at("2026-03-15T01:00:00Z"))).toEqual(at("2026-03-15T04:30:00Z"));
    });

    it("waits a full week once this week's slot has passed", () => {
      expect(computeNextRun(weekly, at("2026-03-15T04:30:00Z"))).toEqual(at("2026-03-22T04:30:00Z"));
    });
  });

  describe("hourly", () => {
    it("aligns to the clock rather than to when the task was created", () => {
      const every6 = { frequency: "HOURLY", everyHours: 6 } as const;
      expect(computeNextRun(every6, at("2026-03-10T07:12:00Z"))).toEqual(at("2026-03-10T12:00:00Z"));
      expect(computeNextRun(every6, at("2026-03-10T12:00:00Z"))).toEqual(at("2026-03-10T18:00:00Z"));
      expect(computeNextRun(every6, at("2026-03-10T23:59:59Z"))).toEqual(at("2026-03-11T00:00:00Z"));
    });

    it("runs every hour for an interval of one", () => {
      const hourly = { frequency: "HOURLY", everyHours: 1 } as const;
      expect(computeNextRun(hourly, at("2026-03-10T07:12:00Z"))).toEqual(at("2026-03-10T08:00:00Z"));
    });
  });

  it("skips slots missed during an outage instead of replaying them", () => {
    const daily = { frequency: "DAILY", minuteOfDayUtc: 60 } as const;
    // The task was due three days ago; asked "what is next after now", not "after then".
    const next = computeNextRun(daily, at("2026-03-10T09:00:00Z"));
    expect(next).toEqual(at("2026-03-11T01:00:00Z"));
  });

  it("clamps nonsense input to something that still fires", () => {
    expect(
      computeNextRun({ frequency: "HOURLY", everyHours: 0 }, at("2026-03-10T07:12:00Z")),
    ).toEqual(at("2026-03-10T08:00:00Z"));
    expect(
      computeNextRun({ frequency: "DAILY", minuteOfDayUtc: 99_999 }, at("2026-03-10T07:00:00Z")),
    ).toEqual(at("2026-03-10T23:59:00Z"));
    expect(
      computeNextRun(
        { frequency: "WEEKLY", minuteOfDayUtc: 0, dayOfWeekUtc: -1 },
        at("2026-03-10T07:00:00Z"),
      ),
    ).toEqual(at("2026-03-14T00:00:00Z")); // -1 wraps to Saturday
  });
});
