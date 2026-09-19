"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createServerSchema,
  powerActionSchema,
  renameServerSchema,
  resizeServerSchema,
} from "@/lib/validation/server";
import { requireUser } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import { checkoutMock, setCancelAtPeriodEnd } from "@/server/services/order-service";
import {
  createBackup,
  deleteBackup,
  restoreBackup,
} from "@/server/services/backup-service";
import { previewResize, resizeServer, type ResizePreview } from "@/server/services/resize-service";
import {
  deleteServer,
  powerServer,
  renameServer,
} from "@/server/services/server-service";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; details?: unknown };

function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { ok: false, error: "validation", details: z.flattenError(error) };
  }
  if (error instanceof AppError) {
    return { ok: false, error: error.code, details: error.details ?? error.message };
  }
  console.error(error);
  return { ok: false, error: "internal_error" };
}

export async function createServerAction(
  input: unknown,
): Promise<ActionResult<{ serverId: string; orderId: string }>> {
  const user = await requireUser();
  try {
    const data = createServerSchema.parse(input);
    const result = await checkoutMock(user.id, data);
    revalidatePath("/", "layout");
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function powerAction(
  serverId: string,
  action: unknown,
): Promise<ActionResult<{ status: string }>> {
  const user = await requireUser();
  try {
    const { action: parsedAction } = powerActionSchema.parse({ action });
    const server = await powerServer(serverId, user.id, parsedAction);
    revalidatePath("/", "layout");
    return { ok: true, data: { status: server.status } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function renameServerAction(
  serverId: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const { name } = renameServerSchema.parse(input);
    await renameServer(serverId, user.id, name);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteServerAction(serverId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteServer(serverId, user.id);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

// --- resize -----------------------------------------------------------------

export async function previewResizeAction(
  serverId: string,
  input: unknown,
): Promise<ActionResult<ResizePreview>> {
  const user = await requireUser();
  try {
    const config = resizeServerSchema.parse(input);
    return { ok: true, data: await previewResize(serverId, user.id, config) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resizeServerAction(
  serverId: string,
  input: unknown,
): Promise<ActionResult<{ chargeCents: number; creditCents: number }>> {
  const user = await requireUser();
  try {
    const config = resizeServerSchema.parse(input);
    const result = await resizeServer(serverId, user.id, config);
    revalidatePath("/", "layout");
    return {
      ok: true,
      data: {
        chargeCents: result.preview.proration.chargeCents,
        creditCents: result.preview.proration.creditCents,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

// --- backups ----------------------------------------------------------------

export async function createBackupAction(
  serverId: string,
  name?: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await createBackup(serverId, user.id, name);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function restoreBackupAction(
  serverId: string,
  backupId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await restoreBackup(serverId, user.id, backupId);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBackupAction(
  serverId: string,
  backupId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteBackup(serverId, user.id, backupId);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

// --- subscription -----------------------------------------------------------

export async function setCancelAtPeriodEndAction(
  subscriptionId: string,
  cancel: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const result = await setCancelAtPeriodEnd(subscriptionId, user.id, cancel);
    if (!result) return { ok: false, error: "not_found" };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
