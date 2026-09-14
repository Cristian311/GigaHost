import {
  MONTHS_PER_PERIOD,
  type BillingPeriod,
  type PriceBreakdown,
  type PricingTable,
  type ServerConfigInput,
} from "./types";

function discountRateFor(period: BillingPeriod, table: PricingTable): number {
  switch (period) {
    case "QUARTERLY":
      return table.quarterlyDiscount;
    case "YEARLY":
      return table.yearlyDiscount;
    default:
      return 0;
  }
}

/**
 * Pure pricing engine. Works exclusively in integer cents so that the client
 * preview and the server-side recomputation always agree to the cent.
 */
export function calculatePrice(
  config: ServerConfigInput,
  table: PricingTable,
): PriceBreakdown {
  const baseCents = table.basePriceCents;
  const ramCents = config.ramGb * table.pricePerGbRamCents;
  const cpuCents = config.vcpu * table.pricePerVcpuCents;
  const storageCents = config.storageGb * table.pricePerGbStorageCents;

  const rawMonthly = baseCents + ramCents + cpuCents + storageCents;
  const monthlyCents = Math.round(rawMonthly * config.regionMultiplier);
  const regionAdjustmentCents = monthlyCents - rawMonthly;

  const months = MONTHS_PER_PERIOD[config.billingPeriod];
  const subtotalCents = monthlyCents * months;

  const discountRate = discountRateFor(config.billingPeriod, table);
  const discountCents = Math.round(subtotalCents * discountRate);
  const totalCents = subtotalCents - discountCents;

  return {
    currency: table.currency,
    baseCents,
    ramCents,
    cpuCents,
    storageCents,
    regionAdjustmentCents,
    monthlyCents,
    months,
    subtotalCents,
    discountRate,
    discountCents,
    totalCents,
    effectiveMonthlyCents: Math.round(totalCents / months),
  };
}

/** Formats integer cents as a localized currency string. */
export function formatMoney(
  cents: number,
  currency: string,
  locale: string = "en",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
