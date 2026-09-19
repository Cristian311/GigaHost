export type ProrateInput = {
  /** Current monthly price of the server, in cents. */
  oldMonthlyCents: number;
  /** Monthly price after the change, in cents. */
  newMonthlyCents: number;
  /** Months covered by the subscription period (1, 3 or 12). */
  months: number;
  periodStart: Date;
  periodEnd: Date;
  /** Defaults to now; injectable so tests are deterministic. */
  now?: Date;
};

export type ProrateResult = {
  /** Share of the paid period that is still unused, 0…1. */
  remainingFraction: number;
  /** Positive when the customer owes money, negative when they overpaid. */
  deltaCents: number;
  /** Amount charged immediately (0 for downgrades). */
  chargeCents: number;
  /** Credit kept for the next renewal (0 for upgrades). */
  creditCents: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Prices a mid-period resource change.
 *
 * The customer already paid for the whole period, so only the unused share is
 * re-priced: the difference between the new and the old monthly rate, spread
 * over the months of the period, times the fraction still to run.
 *
 * Upgrades are billed immediately. Downgrades are not refunded; the difference
 * becomes a credit applied at the next renewal.
 */
export function prorate(input: ProrateInput): ProrateResult {
  const now = input.now ?? new Date();
  const total = input.periodEnd.getTime() - input.periodStart.getTime();
  const remaining = input.periodEnd.getTime() - now.getTime();
  const remainingFraction = total <= 0 ? 0 : clamp01(remaining / total);

  const deltaCents = Math.round(
    (input.newMonthlyCents - input.oldMonthlyCents) * input.months * remainingFraction,
  );

  return {
    remainingFraction,
    deltaCents,
    chargeCents: Math.max(0, deltaCents),
    creditCents: Math.max(0, -deltaCents),
  };
}
