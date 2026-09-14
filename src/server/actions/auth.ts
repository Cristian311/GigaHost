"use server";

import { AuthError } from "next-auth";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { AppError } from "@/server/errors";
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
  });
  if (!parsed.success) {
    return { error: "validation", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    await registerUser({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      locale,
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
