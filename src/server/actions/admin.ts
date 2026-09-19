"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import {
  pricingConfigSchema,
  setUserRoleSchema,
  suspendServerSchema,
  upsertCouponSchema,
  upsertGameSchema,
  upsertRegionSchema,
} from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import { clientIp } from "@/server/security/rate-limit";
import {
  deleteGame,
  deleteRegion,
  setUserRole,
  suspendServer,
  unsuspendServer,
  updatePricing,
  upsertGame,
  upsertRegion,
} from "@/server/services/admin-service";
import { recordAudit, type AuditAction } from "@/server/services/audit-service";
import { deleteCoupon, upsertCoupon } from "@/server/services/coupon-service";
import { runBillingCycle, type BillingCycleReport } from "@/server/services/renewal-service";
import type { ActionResult } from "./servers";

function fail(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { ok: false, error: "validation", details: z.flattenError(error) };
  }
  if (error instanceof AppError) {
    return { ok: false, error: error.code, details: error.details ?? error.message };
  }
  console.error(error);
  return { ok: false, error: "internal_error" };
}

type Trail = { targetType?: string; targetId?: string; meta?: Record<string, unknown> };

/**
 * Runs an admin mutation and, once it succeeded, writes it to the audit log
 * with the acting admin and their address. `work` returns what to record.
 */
async function audited<T = undefined>(
  action: AuditAction,
  work: (adminId: string) => Promise<{ data?: T; trail?: Trail }>,
): Promise<ActionResult<T>> {
  const admin = await requireAdmin();
  try {
    const { data, trail } = await work(admin.id);
    await recordAudit({
      actorId: admin.id,
      action,
      ip: clientIp(await headers()),
      ...trail,
    });
    revalidatePath("/", "layout");
    return { ok: true, data: data as T };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePricingAction(input: unknown): Promise<ActionResult> {
  return audited("pricing.update", async () => {
    const data = pricingConfigSchema.parse(input);
    await updatePricing(data);
    return { trail: { targetType: "PricingConfig", meta: data } };
  });
}

export async function upsertGameAction(input: unknown): Promise<ActionResult> {
  return audited("game.upsert", async () => {
    const game = await upsertGame(upsertGameSchema.parse(input));
    return { trail: { targetType: "Game", targetId: game.id, meta: { slug: game.slug } } };
  });
}

export async function deleteGameAction(id: string): Promise<ActionResult> {
  return audited("game.delete", async () => {
    const gameId = z.string().min(1).parse(id);
    await deleteGame(gameId);
    return { trail: { targetType: "Game", targetId: gameId } };
  });
}

export async function upsertRegionAction(input: unknown): Promise<ActionResult> {
  return audited("region.upsert", async () => {
    const region = await upsertRegion(upsertRegionSchema.parse(input));
    return { trail: { targetType: "Region", targetId: region.id, meta: { code: region.code } } };
  });
}

export async function deleteRegionAction(id: string): Promise<ActionResult> {
  return audited("region.delete", async () => {
    const regionId = z.string().min(1).parse(id);
    await deleteRegion(regionId);
    return { trail: { targetType: "Region", targetId: regionId } };
  });
}

export async function suspendServerAction(input: unknown): Promise<ActionResult> {
  return audited("server.suspend", async () => {
    const { serverId, reason } = suspendServerSchema.parse(input);
    await suspendServer(serverId, reason);
    return { trail: { targetType: "Server", targetId: serverId, meta: { reason: reason ?? null } } };
  });
}

export async function unsuspendServerAction(serverId: string): Promise<ActionResult> {
  return audited("server.unsuspend", async () => {
    const id = z.string().min(1).parse(serverId);
    await unsuspendServer(id);
    return { trail: { targetType: "Server", targetId: id } };
  });
}

export async function setUserRoleAction(input: unknown): Promise<ActionResult> {
  return audited("user.role", async (adminId) => {
    const data = setUserRoleSchema.parse(input);
    if (data.userId === adminId && data.role !== "ADMIN") {
      throw new AppError("cannot_demote_self", 400);
    }
    await setUserRole(data.userId, data.role);
    return { trail: { targetType: "User", targetId: data.userId, meta: { role: data.role } } };
  });
}

export async function upsertCouponAction(input: unknown): Promise<ActionResult> {
  return audited("coupon.upsert", async () => {
    const coupon = await upsertCoupon(upsertCouponSchema.parse(input));
    return {
      trail: {
        targetType: "Coupon",
        targetId: coupon.id,
        meta: { code: coupon.code, kind: coupon.kind, value: coupon.value, active: coupon.active },
      },
    };
  });
}

export async function deleteCouponAction(id: string): Promise<ActionResult> {
  return audited("coupon.delete", async () => {
    const couponId = z.string().min(1).parse(id);
    await deleteCoupon(couponId);
    return { trail: { targetType: "Coupon", targetId: couponId } };
  });
}

/** Runs the billing engine on demand; production relies on /api/cron/billing. */
export async function runBillingCycleAction(): Promise<ActionResult<BillingCycleReport>> {
  return audited<BillingCycleReport>("billing.run", async () => {
    const report = await runBillingCycle();
    return { data: report, trail: { meta: report } };
  });
}
