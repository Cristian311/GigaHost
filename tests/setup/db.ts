import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Role, ServerStatus } from "@/generated/prisma/client";
import { checkoutMock } from "@/server/services/order-service";
import type { BillingPeriod } from "@/lib/pricing/types";

export const ADMIN_EMAIL = "admin@gigahost.local";

let userCounter = 0;

/** Removes all per-user data but keeps the seeded catalog (games, regions, pricing). */
export async function resetData() {
  await prisma.auditLog.deleteMany();
  await prisma.emailMessage.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.couponRedemption.deleteMany();
  await prisma.serverEvent.deleteMany();
  await prisma.backup.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.order.deleteMany();
  await prisma.server.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.user.deleteMany({ where: { email: { not: ADMIN_EMAIL } } });
}

export async function createUser(
  options: { role?: Role; email?: string; locale?: string; verified?: boolean } = {},
) {
  userCounter += 1;
  return prisma.user.create({
    data: {
      email: options.email ?? `user${userCounter}.${Date.now()}@test.local`,
      name: `Test User ${userCounter}`,
      passwordHash: await hash("password1234", 4),
      role: options.role ?? "USER",
      locale: options.locale ?? "en",
      // Most tests are about something else; they get a confirmed address.
      emailVerified: options.verified === false ? null : new Date(),
    },
  });
}

/** Emails produced so far, oldest first. */
export function outbox(to?: string) {
  return prisma.emailMessage.findMany({
    where: to ? { to } : undefined,
    orderBy: { createdAt: "asc" },
  });
}

/** Pulls the single-use token out of the link in an email. */
export function tokenFromEmail(email: { text: string }): string {
  const match = email.text.match(/[?&]token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("No token link in this email.");
  return match[1];
}

/** Creates a paid server through the real checkout path. */
export async function createServerFor(
  userId: string,
  overrides: Partial<{
    name: string;
    gameSlug: string;
    gameVersion: string;
    ramGb: number;
    vcpu: number;
    storageGb: number;
    regionCode: string;
    billingPeriod: BillingPeriod;
    couponCode: string;
  }> = {},
) {
  const result = await checkoutMock(userId, {
    name: overrides.name ?? "Test Server",
    gameSlug: overrides.gameSlug ?? "minecraft-java",
    gameVersion: overrides.gameVersion,
    ramGb: overrides.ramGb ?? 8,
    vcpu: overrides.vcpu ?? 4,
    storageGb: overrides.storageGb ?? 50,
    regionCode: overrides.regionCode ?? "eu-ro",
    billingPeriod: overrides.billingPeriod ?? "MONTHLY",
    couponCode: overrides.couponCode,
  });
  return result;
}

const DAY_MS = 86_400_000;

/**
 * Makes a subscription's paid period end `daysAgo` days in the past, so the
 * billing engine sees it as due without the test having to wait a month.
 */
export async function endPeriod(serverId: string, daysAgo = 0) {
  const end = new Date(Date.now() - daysAgo * DAY_MS - 1000);
  return prisma.subscription.update({
    where: { serverId },
    data: { currentPeriodStart: new Date(end.getTime() - 30 * DAY_MS), currentPeriodEnd: end },
  });
}

/** A point in time `days` from now; passed to the billing engine as "now". */
export function daysFromNow(days: number) {
  return new Date(Date.now() + days * DAY_MS);
}

export async function createCoupon(
  overrides: Partial<{
    code: string;
    kind: "PERCENT" | "FIXED";
    value: number;
    maxRedemptions: number | null;
    perUserLimit: number;
    minOrderCents: number;
    expiresAt: Date | null;
    active: boolean;
  }> = {},
) {
  return prisma.coupon.create({
    data: {
      code: overrides.code ?? "WELCOME20",
      kind: overrides.kind ?? "PERCENT",
      value: overrides.value ?? 20,
      maxRedemptions: overrides.maxRedemptions ?? null,
      perUserLimit: overrides.perUserLimit ?? 1,
      minOrderCents: overrides.minOrderCents ?? 0,
      expiresAt: overrides.expiresAt ?? null,
      active: overrides.active ?? true,
    },
  });
}

/**
 * Moves a server's `statusChangedAt` into the past so the MockProvider's lazy
 * transitions fire without the test having to wait in real time.
 */
export async function ageServer(serverId: string, ms: number) {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  return prisma.server.update({
    where: { id: serverId },
    data: { statusChangedAt: new Date(server.statusChangedAt.getTime() - ms) },
  });
}

export async function ageBackup(backupId: string, ms: number) {
  const backup = await prisma.backup.findUniqueOrThrow({ where: { id: backupId } });
  return prisma.backup.update({
    where: { id: backupId },
    data: { statusChangedAt: new Date(backup.statusChangedAt.getTime() - ms) },
  });
}

/** Forces a server into a given status (bypassing the state machine). */
export async function setStatus(serverId: string, status: ServerStatus) {
  return prisma.server.update({
    where: { id: serverId },
    data: { status, statusChangedAt: new Date() },
  });
}
