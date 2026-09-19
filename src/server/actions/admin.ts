"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  inspectEggSchema,
  pricingConfigSchema,
  setUserRoleSchema,
  upsertGameSchema,
  upsertRegionSchema,
} from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import {
  deleteGame,
  inspectEgg,
  inspectLocation,
  setUserRole,
  updatePricing,
  upsertGame,
  upsertRegion,
  type EggInspection,
  type LocationInspection,
} from "@/server/services/admin-service";
import {
  adminDeleteServer,
  suspendServer,
  unsuspendServer,
} from "@/server/services/server-service";
import type { ActionResult } from "./servers";

const idSchema = z.string().min(1);

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

/** Runs a mutation and revalidates every page, mapping errors to an ActionResult. */
async function mutate(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

/** Runs a read-only query, mapping errors to an ActionResult. */
async function query<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePricingAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  return mutate(() => updatePricing(pricingConfigSchema.parse(input)));
}

export async function upsertGameAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  return mutate(() => upsertGame(upsertGameSchema.parse(input)));
}

export async function deleteGameAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  return mutate(() => deleteGame(idSchema.parse(id)));
}

export async function upsertRegionAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  return mutate(() => upsertRegion(upsertRegionSchema.parse(input)));
}

export async function inspectEggAction(input: unknown): Promise<ActionResult<EggInspection>> {
  await requireAdmin();
  return query(() => {
    const { nestId, eggId } = inspectEggSchema.parse(input);
    return inspectEgg(nestId, eggId);
  });
}

export async function inspectLocationAction(
  locationId: unknown,
): Promise<ActionResult<LocationInspection>> {
  await requireAdmin();
  return query(() => inspectLocation(z.number().int().positive().parse(locationId)));
}

export async function suspendServerAction(serverId: string): Promise<ActionResult> {
  await requireAdmin();
  return mutate(() => suspendServer(idSchema.parse(serverId)));
}

export async function unsuspendServerAction(serverId: string): Promise<ActionResult> {
  await requireAdmin();
  return mutate(() => unsuspendServer(idSchema.parse(serverId)));
}

export async function adminDeleteServerAction(serverId: string): Promise<ActionResult> {
  await requireAdmin();
  return mutate(() => adminDeleteServer(idSchema.parse(serverId)));
}

export async function setUserRoleAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = setUserRoleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  if (parsed.data.userId === admin.id && parsed.data.role !== "ADMIN") {
    return { ok: false, error: "cannot_demote_self" };
  }
  return mutate(() => setUserRole(parsed.data.userId, parsed.data.role));
}
