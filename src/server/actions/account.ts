"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { signOut } from "@/auth";
import { changePasswordSchema, updateAccountSchema } from "@/lib/validation/auth";
import { requireUser } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import { changePassword, updateProfile } from "@/server/services/user-service";
import type { ActionResult } from "./servers";

export async function updateAccountAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = updateAccountSchema.parse(input);
    await updateProfile(user.id, data);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: "validation", details: z.flattenError(error) };
    }
    console.error(error);
    return { ok: false, error: "internal_error" };
  }
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = changePasswordSchema.parse(input);
    await changePassword(user.id, data.currentPassword, data.newPassword);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: "validation", details: z.flattenError(error) };
    }
    if (error instanceof AppError) return { ok: false, error: error.code };
    console.error(error);
    return { ok: false, error: "internal_error" };
  }

  // The new password ended every session of this account, this one included.
  // Signing out here sends the customer to the login page instead of leaving
  // them on a page whose next request would fail.
  const locale = await getLocale();
  return signOut({ redirectTo: `/${locale}/login?notice=password_changed` });
}
