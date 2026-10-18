import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import { notifyPasswordChanged, sendVerificationEmail } from "./account-security-service";

export async function registerUser(params: {
  name: string;
  email: string;
  password: string;
  locale?: string;
  /** Version of the terms the customer ticked; recorded with the moment. */
  termsVersion?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) throw new AppError("email_taken", 409);

  const passwordHash = await hash(params.password, 10);
  const user = await prisma.user.create({
    data: {
      name: params.name,
      email: params.email,
      passwordHash,
      locale: params.locale ?? "en",
      ...(params.termsVersion
        ? { termsAcceptedAt: new Date(), termsVersion: params.termsVersion }
        : {}),
    },
  });

  // The account exists either way; a mail problem must not undo the sign-up.
  // The customer can ask for the link again from the dashboard.
  try {
    await sendVerificationEmail(user.id);
  } catch (error) {
    console.error(`Could not send the verification email to ${user.email}`, error);
  }

  return user;
}

export async function updateProfile(
  userId: string,
  data: { name: string; locale: string },
) {
  return prisma.user.update({ where: { id: userId }, data });
}

/**
 * Confirms the account's own password before something irreversible. Accounts
 * that only ever signed in with Google or Discord have no password to check,
 * and are told so rather than being let through.
 */
export async function assertPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) throw new AppError("invalid_credentials", 400);
  if (!(await compare(password, user.passwordHash))) {
    throw new AppError("invalid_credentials", 400);
  }
  return user;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) throw new AppError("invalid_credentials", 400);
  const ok = await compare(currentPassword, user.passwordHash);
  if (!ok) throw new AppError("invalid_credentials", 400);
  const updated = await prisma.user.update({
    where: { id: userId },
    // Bumping the version signs out every other session of this account.
    data: { passwordHash: await hash(newPassword, 10), sessionVersion: { increment: 1 } },
  });
  await notifyPasswordChanged(userId);
  return updated;
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      locale: true,
      createdAt: true,
      passwordHash: true,
      emailVerified: true,
    },
  });
}
