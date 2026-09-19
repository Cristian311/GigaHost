import { describe, expect, it } from "vitest";
import { couponDiscount, normalizeCouponCode } from "./coupon";

describe("couponDiscount", () => {
  it("takes a percentage of the amount", () => {
    expect(couponDiscount({ kind: "PERCENT", value: 20 }, 1400)).toBe(280);
  });

  it("rounds percentages to whole cents", () => {
    // 15 % of 9.99 = 1.4985 -> 1.50
    expect(couponDiscount({ kind: "PERCENT", value: 15 }, 999)).toBe(150);
  });

  it("takes a fixed amount off", () => {
    expect(couponDiscount({ kind: "FIXED", value: 500 }, 1400)).toBe(500);
  });

  it("never discounts more than the amount", () => {
    expect(couponDiscount({ kind: "FIXED", value: 5000 }, 1400)).toBe(1400);
    expect(couponDiscount({ kind: "PERCENT", value: 100 }, 1400)).toBe(1400);
  });

  it("caps a percentage above 100", () => {
    expect(couponDiscount({ kind: "PERCENT", value: 250 }, 1000)).toBe(1000);
  });

  it("gives nothing for a zero amount or a non-positive value", () => {
    expect(couponDiscount({ kind: "PERCENT", value: 50 }, 0)).toBe(0);
    expect(couponDiscount({ kind: "FIXED", value: 0 }, 1000)).toBe(0);
    expect(couponDiscount({ kind: "FIXED", value: -100 }, 1000)).toBe(0);
  });
});

describe("normalizeCouponCode", () => {
  it("upper-cases and trims", () => {
    expect(normalizeCouponCode("  welcome10 ")).toBe("WELCOME10");
  });
});
