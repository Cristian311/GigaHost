export type BillingPeriod = "MONTHLY" | "QUARTERLY" | "YEARLY";

export const BILLING_PERIODS: readonly BillingPeriod[] = [
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
] as const;

export const MONTHS_PER_PERIOD: Record<BillingPeriod, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/** What the user picked in the configurator. */
export type ServerConfigInput = {
  ramGb: number;
  vcpu: number;
  storageGb: number;
  /** Region price multiplier, 1.0 = base. */
  regionMultiplier: number;
  billingPeriod: BillingPeriod;
};

/** Pricing table (all money values are integer cents). */
export type PricingTable = {
  currency: string;
  basePriceCents: number;
  pricePerGbRamCents: number;
  pricePerVcpuCents: number;
  pricePerGbStorageCents: number;
  quarterlyDiscount: number;
  yearlyDiscount: number;
};

/** Full breakdown returned by the engine (integer cents). */
export type PriceBreakdown = {
  currency: string;
  /** Per-month components before region multiplier. */
  baseCents: number;
  ramCents: number;
  cpuCents: number;
  storageCents: number;
  /** Extra (or saving) introduced by the region multiplier. */
  regionAdjustmentCents: number;
  /** Final monthly price after region multiplier. */
  monthlyCents: number;
  months: number;
  subtotalCents: number;
  discountRate: number;
  discountCents: number;
  totalCents: number;
  /** total / months, what the customer effectively pays per month. */
  effectiveMonthlyCents: number;
};
