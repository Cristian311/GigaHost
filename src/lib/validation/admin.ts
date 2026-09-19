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

/** True for a JSON object whose values are all scalars (egg variables). */
function isScalarRecordJson(raw: string): boolean {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.values(value).every((v) => ["string", "number", "boolean"].includes(typeof v))
    );
  } catch {
    return false;
  }
}

const optionalId = z.number().int().positive().nullable().optional();
const emptyToNull = (value: string | null | undefined) => (value ? value : null);

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
  pterodactylNestId: optionalId,
  pterodactylEggId: optionalId,
  dockerImage: z.string().trim().max(200).nullable().optional().transform(emptyToNull),
  versionVariable: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Z0-9_]*$/, "env_format")
    .nullable()
    .optional()
    .transform(emptyToNull),
  eggVariables: z.string().max(4000).refine(isScalarRecordJson, "json_object").default("{}"),
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
  flag: z.string().trim().min(1).max(16),
  priceMultiplier: z.number().min(0.1).max(10),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  pterodactylLocationId: optionalId,
});

export const inspectEggSchema = z.object({
  nestId: z.number().int().positive(),
  eggId: z.number().int().positive(),
});

export const setUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["USER", "ADMIN"]),
});
