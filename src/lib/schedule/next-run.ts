export type Schedule =
  | { frequency: "HOURLY"; everyHours: number }
  | { frequency: "DAILY"; minuteOfDayUtc: number }
  | { frequency: "WEEKLY"; minuteOfDayUtc: number; dayOfWeekUtc: number };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * First moment strictly after `after` at which the schedule fires. Always in
 * the future relative to `after`, so a scheduler that was down for a day runs a
 * missed task once and moves on instead of replaying every slot it missed.
 *
 * Everything is UTC: the UI converts to and from the customer's local time.
 */
export function computeNextRun(schedule: Schedule, after: Date): Date {
  if (schedule.frequency === "HOURLY") {
    const step = Math.max(1, Math.floor(schedule.everyHours)) * HOUR_MS;
    // Aligned to the top of the hour, so "every 6 hours" means 00, 06, 12, 18.
    const next = Math.floor(after.getTime() / step) * step + step;
    return new Date(next);
  }

  const minute = Math.min(Math.max(0, Math.floor(schedule.minuteOfDayUtc)), 24 * 60 - 1);
  const midnight = Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate());
  let candidate = midnight + minute * MINUTE_MS;

  if (schedule.frequency === "DAILY") {
    if (candidate <= after.getTime()) candidate += DAY_MS;
    return new Date(candidate);
  }

  const targetDay = ((Math.floor(schedule.dayOfWeekUtc) % 7) + 7) % 7;
  const daysAhead = (targetDay - new Date(midnight).getUTCDay() + 7) % 7;
  candidate += daysAhead * DAY_MS;
  if (candidate <= after.getTime()) candidate += 7 * DAY_MS;
  return new Date(candidate);
}
