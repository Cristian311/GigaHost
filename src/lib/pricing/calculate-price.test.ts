import { describe, expect, it } from "vitest";
import { calculatePrice, formatMoney } from "./calculate-price";
import type { PricingTable, ServerConfigInput } from "./types";

const table: PricingTable = {
  currency: "EUR",
  basePriceCents: 200, // 2.00
  pricePerGbRamCents: 150, // 1.50 / GB
  pricePerVcpuCents: 200, // 2.00 / vCPU
  pricePerGbStorageCents: 10, // 0.10 / GB
  quarterlyDiscount: 0.05,
  yearlyDiscount: 0.15,
};

const baseConfig: ServerConfigInput = {
  ramGb: 8,
  vcpu: 4,
  storageGb: 50,
  regionMultiplier: 1,
  billingPeriod: "MONTHLY",
};

describe("calculatePrice", () => {
  it("computes the monthly price from the components", () => {
    const p = calculatePrice(baseConfig, table);
    // 2.00 + 8*1.50 + 4*2.00 + 50*0.10 = 2 + 12 + 8 + 5 = 27.00
    expect(p.baseCents).toBe(200);
    expect(p.ramCents).toBe(1200);
    expect(p.cpuCents).toBe(800);
    expect(p.storageCents).toBe(500);
    expect(p.monthlyCents).toBe(2700);
    expect(p.months).toBe(1);
    expect(p.subtotalCents).toBe(2700);
    expect(p.discountCents).toBe(0);
    expect(p.totalCents).toBe(2700);
    expect(p.effectiveMonthlyCents).toBe(2700);
    expect(p.regionAdjustmentCents).toBe(0);
  });

  it("applies the region multiplier and reports the adjustment", () => {
    const p = calculatePrice({ ...baseConfig, regionMultiplier: 1.05 }, table);
    // 27.00 * 1.05 = 28.35
    expect(p.monthlyCents).toBe(2835);
    expect(p.regionAdjustmentCents).toBe(135);
  });

  it("charges 3 months minus 5 % for quarterly billing", () => {
    const p = calculatePrice({ ...baseConfig, billingPeriod: "QUARTERLY" }, table);
    expect(p.months).toBe(3);
    expect(p.subtotalCents).toBe(8100);
    expect(p.discountRate).toBe(0.05);
    expect(p.discountCents).toBe(405);
    expect(p.totalCents).toBe(7695);
    expect(p.effectiveMonthlyCents).toBe(2565);
  });

  it("charges 12 months minus 15 % for yearly billing", () => {
    const p = calculatePrice(
      { ...baseConfig, regionMultiplier: 1.05, billingPeriod: "YEARLY" },
      table,
    );
    // monthly 28.35 -> 340.20 / year -> 15 % off = 51.03 -> 289.17
    expect(p.months).toBe(12);
    expect(p.subtotalCents).toBe(34020);
    expect(p.discountCents).toBe(5103);
    expect(p.totalCents).toBe(28917);
    expect(p.effectiveMonthlyCents).toBe(Math.round(28917 / 12));
  });

  it("always returns integers (never fractional cents)", () => {
    const p = calculatePrice(
      { ramGb: 3, vcpu: 1, storageGb: 15, regionMultiplier: 1.13, billingPeriod: "YEARLY" },
      table,
    );
    for (const value of Object.values(p)) {
      if (typeof value === "number" && value !== p.discountRate) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("supports a zero-discount table", () => {
    const p = calculatePrice(
      { ...baseConfig, billingPeriod: "YEARLY" },
      { ...table, yearlyDiscount: 0 },
    );
    expect(p.discountCents).toBe(0);
    expect(p.totalCents).toBe(2700 * 12);
  });
});

describe("formatMoney", () => {
  it("formats cents as currency", () => {
    expect(formatMoney(2700, "EUR", "en")).toBe("€27.00");
    expect(formatMoney(5, "EUR", "en")).toBe("€0.05");
  });
});
