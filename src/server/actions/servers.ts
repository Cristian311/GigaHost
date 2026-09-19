"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { APP_URL } from "@/lib/constants";
import {
  couponPreviewSchema,
  createServerSchema,
  powerActionSchema,
  renameServerSchema,
  resizeServerSchema,
} from "@/lib/validation/server";
import { getOptionalUser, requireUser } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import { validateCoupon } from "@/server/services/coupon-service";
import { checkout, setCancelAtPeriodEnd } from "@/server/services/order-service";
import { quote } from "@/server/services/pricing-service";
import { getPaymentPortalUrl } from "@/server/services/payment-service";
import { payOutstanding } from "@/server/services/renewal-service";
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

/**
 * `serverId` is set when the order was settled on the spot; `redirectUrl` when
 * the customer still has to pay on the gateway's hosted page.
 */
export type CheckoutActionData =
  | { orderId: string; serverId: string; redirectUrl?: undefined }
  | { orderId: string; redirectUrl: string; serverId?: undefined };

export async function createServerAction(
  input: unknown,
): Promise<ActionResult<CheckoutActionData>> {
  const user = await requireUser();
  try {
    const data = createServerSchema.parse(input);
    const locale = await getLocale();
    const result = await checkout(user.id, data, {
      successUrl: `${APP_URL}/${locale}/dashboard/checkout/success`,
      cancelUrl: `${APP_URL}/${locale}/configure`,
    });
    revalidatePath("/", "layout");
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Prices a coupon for the configurator. Works before login too; the per-user
 * limit is then checked again at checkout.
 */
export async function previewCouponAction(
  input: unknown,
): Promise<ActionResult<{ code: string; discountCents: number; totalCents: number }>> {
  try {
    const { couponCode, ...config } = couponPreviewSchema.parse(input);
    const [{ breakdown }, user] = await Promise.all([quote(config), getOptionalUser()]);
    const applied = await validateCoupon(couponCode, breakdown.totalCents, user?.id);
    return {
      ok: true,
      data: {
        code: applied.coupon.code,
        discountCents: applied.discountCents,
        totalCents: breakdown.totalCents - applied.discountCents,
      },
    };
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

/** Retries the unpaid renewal of a past-due subscription right away. */
export async function payOutstandingAction(subscriptionId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await payOutstanding(z.string().min(1).parse(subscriptionId), user.id);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Link to the gateway-hosted page where the customer replaces their card. */
export async function openPaymentPortalAction(): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  try {
    const locale = await getLocale();
    const url = await getPaymentPortalUrl(user.id, `${APP_URL}/${locale}/dashboard/billing`);
    if (!url) return { ok: false, error: "no_payment_method" };
    return { ok: true, data: { url } };
  } catch (error) {
    return toActionError(error);
  }
}
