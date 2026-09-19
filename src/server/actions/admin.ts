"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  pricingConfigSchema,
  setUserRoleSchema,
  suspendServerSchema,
  upsertGameSchema,
  upsertRegionSchema,
} from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
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

export async function updatePricingAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  try {
    await updatePricing(pricingConfigSchema.parse(input));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function upsertGameAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  try {
    await upsertGame(upsertGameSchema.parse(input));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteGameAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await deleteGame(z.string().min(1).parse(id));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function upsertRegionAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  try {
    await upsertRegion(upsertRegionSchema.parse(input));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRegionAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await deleteRegion(z.string().min(1).parse(id));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function suspendServerAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  try {
    const { serverId, reason } = suspendServerSchema.parse(input);
    await suspendServer(serverId, reason);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function unsuspendServerAction(serverId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await unsuspendServer(z.string().min(1).parse(serverId));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function setUserRoleAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const data = setUserRoleSchema.parse(input);
    if (data.userId === admin.id && data.role !== "ADMIN") {
      return { ok: false, error: "cannot_demote_self" };
    }
    await setUserRole(data.userId, data.role);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
