"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import {
  forgotPasswordSchema,
  loginSchema,
  CURRENT_TERMS_VERSION,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { requireUser } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import { RATE_LIMITS, assertRateLimit, clientIp } from "@/server/security/rate-limit";
import {
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} from "@/server/services/account-security-service";
import { registerUser } from "@/server/services/user-service";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function safeCallbackUrl(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string") return fallback;
  // Only allow same-origin relative paths.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = await getLocale();
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "invalid_credentials", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const redirectTo = safeCallbackUrl(formData.get("callbackUrl"), `/${locale}/dashboard`);

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "invalid_credentials" };
    }
    throw error; // NEXT_REDIRECT
  }
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = await getLocale();
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    // Absent entirely when the box is not ticked, which is what makes the
    // schema reject it.
    acceptTerms: formData.get("acceptTerms") ?? false,
  });
  if (!parsed.success) {
    return { error: "validation", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    await assertRateLimit(`register:${clientIp(await headers())}`, RATE_LIMITS.register);
    await registerUser({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      locale,
      termsVersion: CURRENT_TERMS_VERSION,
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.code };
    throw error;
  }

  const redirectTo = safeCallbackUrl(formData.get("callbackUrl"), `/${locale}/dashboard`);

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) return { error: "invalid_credentials" };
    throw error;
  }
}

export async function oauthSignInAction(provider: "google" | "discord") {
  const locale = await getLocale();
  await signIn(provider, { redirectTo: `/${locale}/dashboard` });
}

export async function logoutAction() {
  const locale = await getLocale();
  await signOut({ redirectTo: `/${locale}` });
}

// --- password reset & email verification ---------------------------------------

export type SimpleFormState = { ok?: boolean; error?: string };

/**
 * Answers "ok" whether or not the address has an account; only the rate limit
 * can be observed from outside.
 */
export async function requestPasswordResetAction(
  _prev: SimpleFormState,
  formData: FormData,
): Promise<SimpleFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "validation" };

  try {
    const ip = clientIp(await headers());
    await assertRateLimit(`reset:${ip}`, RATE_LIMITS.passwordReset);
    await assertRateLimit(`reset-email:${parsed.data.email}`, RATE_LIMITS.passwordResetPerEmail);
    await requestPasswordReset(parsed.data.email);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.code };
    console.error(error);
    return { error: "internal_error" };
  }
}

export async function resetPasswordAction(
  _prev: SimpleFormState,
  formData: FormData,
): Promise<SimpleFormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.message === "passwords_mismatch");
    return { error: mismatch ? "passwords_mismatch" : "validation" };
  }

  try {
    await assertRateLimit(`reset:${clientIp(await headers())}`, RATE_LIMITS.passwordReset);
    await resetPassword(parsed.data.token, parsed.data.password);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.code };
    console.error(error);
    return { error: "internal_error" };
  }
}

export async function resendVerificationAction(): Promise<SimpleFormState> {
  const user = await requireUser();
  try {
    await assertRateLimit(`verify:${user.id}`, RATE_LIMITS.verificationEmail);
    await sendVerificationEmail(user.id);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.code };
    console.error(error);
    return { error: "internal_error" };
  }
}
