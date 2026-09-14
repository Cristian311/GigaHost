import { z } from "zod";

export const loginSchema = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(128),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwords_mismatch",
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

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
