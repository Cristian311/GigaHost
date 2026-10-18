import { z } from "zod";
import { RESOURCE_LIMITS } from "@/lib/constants";

export const billingPeriodSchema = z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]);

export const serverConfigSchema = z.object({
  gameSlug: z.string().min(1).max(64),
  ramGb: z
    .number()
    .int()
    .min(RESOURCE_LIMITS.ram.min)
    .max(RESOURCE_LIMITS.ram.max),
  vcpu: z
    .number()
    .int()
    .min(RESOURCE_LIMITS.cpu.min)
    .max(RESOURCE_LIMITS.cpu.max),
  storageGb: z
    .number()
    .int()
    .min(RESOURCE_LIMITS.storage.min)
    .max(RESOURCE_LIMITS.storage.max),
  regionCode: z.string().min(1).max(32),
  billingPeriod: billingPeriodSchema,
});

export const couponCodeSchema = z.string().trim().min(1).max(32);

export const createServerSchema = serverConfigSchema.extend({
  name: z.string().trim().min(3).max(40),
  gameVersion: z.string().max(32).optional(),
  couponCode: couponCodeSchema.optional(),
  /**
   * The customer's express request that the server be built now, together with
   * the acknowledgement that this ends the 14-day right of withdrawal once the
   * service has been fully performed. Required, because the server is built
   * immediately and there is no other lawful way to do that.
   */
  waiveWithdrawal: z.literal(true, { error: "withdrawal_waiver_required" }),
});

export const couponPreviewSchema = serverConfigSchema.extend({
  couponCode: couponCodeSchema,
});

export const powerActionSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});

export const serverCommandSchema = z.object({
  command: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]*$/, "single_line"),
});

export const renameServerSchema = z.object({
  name: z.string().trim().min(3).max(40),
});

export const resizeServerSchema = z.object({
  ramGb: z
    .number()
    .int()
    .min(RESOURCE_LIMITS.ram.min)
    .max(RESOURCE_LIMITS.ram.max),
  vcpu: z
    .number()
    .int()
    .min(RESOURCE_LIMITS.cpu.min)
    .max(RESOURCE_LIMITS.cpu.max),
  storageGb: z
    .number()
    .int()
    .min(RESOURCE_LIMITS.storage.min)
    .max(RESOURCE_LIMITS.storage.max),
});

export type ResizeServerInput = z.infer<typeof resizeServerSchema>;

export type ServerConfigInput = z.infer<typeof serverConfigSchema>;
export type CreateServerInput = z.infer<typeof createServerSchema>;
export type PowerAction = z.infer<typeof powerActionSchema>["action"];
