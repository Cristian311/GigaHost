import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";

export async function registerUser(params: {
  name: string;
  email: string;
  password: string;
  locale?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) throw new AppError("email_taken", 409);

  const passwordHash = await hash(params.password, 10);
  return prisma.user.create({
    data: {
      name: params.name,
      email: params.email,
      passwordHash,
      locale: params.locale ?? "en",
    },
  });
}

export async function updateProfile(
  userId: string,
  data: { name: string; locale: string },
) {
  return prisma.user.update({ where: { id: userId }, data });
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
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hash(newPassword, 10) },
  });
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
    },
  });
}
