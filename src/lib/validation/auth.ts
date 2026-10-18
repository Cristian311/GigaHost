import { z } from "zod";

export const loginSchema = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(128),
});

/**
 * Bumped whenever the terms change in a way customers must accept again. The
 * accepted version is stored per account, so it is possible to tell who agreed
 * to what — "they accepted the terms" is not a useful record without it.
 */
export const CURRENT_TERMS_VERSION = "2026-09-20";

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
    // A checkbox the customer ticks: an unticked box sends nothing at all, and
    // a pre-ticked one would not be consent. Literal true, so "false" fails.
    acceptTerms: z
      .union([z.literal("on"), z.literal("true"), z.boolean()])
      .refine((value) => value === true || value === "on" || value === "true", {
        message: "terms_required",
      }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwords_mismatch",
  });

/** Deleting an account destroys servers and data, so the password is required. */
export const deleteAccountSchema = z.object({
  password: z.string().min(8).max(128),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(2).max(60),
  locale: z.enum(["en", "ro"]),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwords_mismatch",
  });

export const forgotPasswordSchema = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwords_mismatch",
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
