"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  pricingConfigSchema,
  setUserRoleSchema,
  upsertGameSchema,
} from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth-guard";
import {
  deleteGame,
  setUserRole,
  updatePricing,
  upsertGame,
} from "@/server/services/admin-service";
import type { ActionResult } from "./servers";

function fail(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { ok: false, error: "validation", details: z.flattenError(error) };
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
