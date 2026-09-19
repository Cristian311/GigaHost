import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { APP_URL } from "@/lib/constants";
import { AppError } from "@/server/errors";
import { sendEmail, sendEmailSafely } from "@/server/mail/mailer";
import { templates, type MailLocale } from "@/server/mail/templates";
import { generateToken, hashToken } from "@/server/security/tokens";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export const mailLocale = (locale: string | null | undefined): MailLocale =>
  locale === "ro" ? "ro" : "en";

/** Set REQUIRE_EMAIL_VERIFICATION=false to let unverified accounts order. */
export function isEmailVerificationRequired(): boolean {
  return (process.env.REQUIRE_EMAIL_VERIFICATION ?? "true").toLowerCase() !== "false";
}

/** Guard for anything that costs money: ordering needs a confirmed address. */
export async function assertEmailVerified(userId: string) {
  if (!isEmailVerificationRequired()) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) throw new AppError("email_not_verified", 403);
}

// --- email verification ----------------------------------------------------------

/** Emails a fresh confirmation link; any earlier link stops working. */
export async function sendVerificationEmail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("not_found", 404);
  if (user.emailVerified) throw new AppError("already_verified", 409);

  const token = generateToken();
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: user.email } }),
    prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token: hashToken(token),
        expires: new Date(Date.now() + VERIFY_TTL_MS),
      },
    }),
  ]);

  const locale = mailLocale(user.locale);
  const url = `${APP_URL}/${locale}/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    userId: user.id,
    template: "verifyEmail",
    email: templates.verifyEmail({ locale, name: user.name, url }),
  });
}

/** Confirms the address the token was issued for. Tokens work once. */
export async function verifyEmail(token: string, now: Date = new Date()) {
  const record = await prisma.verificationToken.findFirst({
    where: { token: hashToken(token) },
  });
  if (!record) throw new AppError("invalid_token", 400);

  // Consume it either way, so an expired link cannot be tried again.
  await prisma.verificationToken.deleteMany({
    where: { identifier: record.identifier, token: record.token },
  });
  if (record.expires <= now) throw new AppError("invalid_token", 400);

  const user = await prisma.user.findUnique({ where: { email: record.identifier } });
  if (!user) throw new AppError("invalid_token", 400);

  return prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: user.emailVerified ?? now },
  });
}

// --- password reset --------------------------------------------------------------

/**
 * Always resolves the same way whether or not the address has an account, so
 * the form cannot be used to find out who is registered.
 */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Accounts created through Google/Discord have no password to reset.
  if (!user?.passwordHash) return;

  const token = generateToken();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    }),
  ]);

  const locale = mailLocale(user.locale);
  const url = `${APP_URL}/${locale}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    userId: user.id,
    template: "passwordReset",
    email: templates.passwordReset({ locale, name: user.name, url }),
  });
}

/** Lets the reset page refuse a dead link before the customer types anything. */
export async function isResetTokenValid(token: string, now: Date = new Date()) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  return Boolean(record && !record.usedAt && record.expiresAt > now);
}

export async function resetPassword(token: string, newPassword: string, now: Date = new Date()) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt <= now) {
    throw new AppError("invalid_token", 400);
  }

  // Claim the token first: of two simultaneous submissions only one gets here.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count === 0) throw new AppError("invalid_token", 400);

  await prisma.user.update({
    where: { id: record.userId },
    data: {
      passwordHash: await hash(newPassword, 10),
      // Whoever had a session with the old password is signed out.
      sessionVersion: { increment: 1 },
      // Opening the link proves control of the mailbox.
      emailVerified: record.user.emailVerified ?? now,
    },
  });

  await notifyPasswordChanged(record.userId);
}

export async function notifyPasswordChanged(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const locale = mailLocale(user.locale);
  await sendEmailSafely({
    to: user.email,
    userId: user.id,
    template: "passwordChanged",
    email: templates.passwordChanged({ locale, name: user.name }),
  });
}
