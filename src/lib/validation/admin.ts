import { z } from "zod";

export const pricingConfigSchema = z.object({
  currency: z.string().length(3).toUpperCase(),
  basePriceCents: z.number().int().min(0).max(1_000_000),
  pricePerGbRamCents: z.number().int().min(0).max(1_000_000),
  pricePerVcpuCents: z.number().int().min(0).max(1_000_000),
  pricePerGbStorageCents: z.number().int().min(0).max(1_000_000),
  quarterlyDiscount: z.number().min(0).max(0.9),
  yearlyDiscount: z.number().min(0).max(0.9),
});

export const upsertGameSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug_format"),
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(2000),
  image: z.string().trim().min(1).max(500),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "color_format"),
  minRamGb: z.number().int().min(1).max(64),
  recommendedRamGb: z.number().int().min(1).max(64),
  minCpu: z.number().int().min(1).max(16),
  minStorageGb: z.number().int().min(10).max(500),
  /** Comma separated list in the form, stored as JSON. */
  versions: z.string().max(1000),
  available: z.boolean(),
  unavailableReason: z.string().max(300).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000),
});

export const upsertRegionSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/, "code_format"),
  name: z.string().trim().min(2).max(60),
  country: z.string().trim().min(2).max(60),
  flag: z.string().trim().min(1).max(8),
  priceMultiplier: z.number().min(0.1).max(5),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

export const upsertCouponSchema = z
  .object({
    id: z.string().optional(),
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "code_format"),
    kind: z.enum(["PERCENT", "FIXED"]),
    /** Percentage (1-100) or cents, depending on `kind`. */
    value: z.number().int().min(1).max(1_000_000),
    maxRedemptions: z.number().int().min(1).max(1_000_000).nullable(),
    perUserLimit: z.number().int().min(1).max(1000),
    minOrderCents: z.number().int().min(0).max(10_000_000),
    expiresAt: z.coerce.date().nullable(),
    active: z.boolean(),
  })
  .refine((c) => c.kind !== "PERCENT" || c.value <= 100, {
    path: ["value"],
    message: "percent_range",
  });

export const suspendServerSchema = z.object({
  serverId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});

export const setUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["USER", "ADMIN"]),
});
