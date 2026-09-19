import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createCoupon, createServerFor, createUser, resetData, setStatus } from "../setup/db";

// Server Actions need a session, the Next.js cache and request headers, none of
// which exist outside the Next.js runtime. Only those edges are replaced; the
// services, the audit trail and the database are real.
const session = vi.hoisted(() => ({
  admin: null as { id: string; role: "ADMIN"; locale: string } | null,
}));

vi.mock("@/server/auth-guard", () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  const requireAdmin = async () => {
    if (!session.admin) throw new ForbiddenError("not an admin");
    return session.admin;
  };
  return {
    UnauthorizedError,
    ForbiddenError,
    requireAdmin,
    requireUser: requireAdmin,
    getApiUser: requireAdmin,
    getApiAdmin: requireAdmin,
    getOptionalUser: async () => session.admin,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

const actions = await import("@/server/actions/admin");
const { listAuditLogs } = await import("@/server/services/audit-service");

describe("admin audit log", () => {
  beforeEach(async () => {
    await resetData();
    const admin = await createUser({ role: "ADMIN" });
    session.admin = { id: admin.id, role: "ADMIN", locale: "en" };
  });

  it("records who suspended which server, from where and why", async () => {
    const owner = await createUser();
    const { serverId } = await createServerFor(owner.id);
    await setStatus(serverId, "STOPPED");

    const result = await actions.suspendServerAction({ serverId, reason: "Abuse report #42" });
    expect(result.ok).toBe(true);

    const [entry] = await listAuditLogs();
    expect(entry).toMatchObject({
      action: "server.suspend",
      targetType: "Server",
      targetId: serverId,
      ip: "203.0.113.9",
      meta: { reason: "Abuse report #42" },
    });
    expect(entry.actor?.email).toBe(
      (await prisma.user.findUniqueOrThrow({ where: { id: session.admin!.id } })).email,
    );
  });

  it("records pricing, coupon and role changes with their details", async () => {
    const target = await createUser();

    await actions.updatePricingAction({
      currency: "EUR",
      basePriceCents: 300,
      pricePerGbRamCents: 150,
      pricePerVcpuCents: 200,
      pricePerGbStorageCents: 10,
      quarterlyDiscount: 0.05,
      yearlyDiscount: 0.15,
    });
    await actions.upsertCouponAction({
      code: "spring15",
      kind: "PERCENT",
      value: 15,
      maxRedemptions: null,
      perUserLimit: 1,
      minOrderCents: 0,
      expiresAt: null,
      active: true,
    });
    await actions.setUserRoleAction({ userId: target.id, role: "ADMIN" });

    const entries = await listAuditLogs();
    expect(entries.map((e) => e.action)).toEqual(["user.role", "coupon.upsert", "pricing.update"]);
    expect(entries[0]).toMatchObject({ targetId: target.id, meta: { role: "ADMIN" } });
    expect(entries[1].meta).toMatchObject({ code: "SPRING15", value: 15 });
    expect(entries[2].meta).toMatchObject({ basePriceCents: 300 });
  });

  it("records a manual billing run with its result", async () => {
    await actions.runBillingCycleAction();

    const [entry] = await listAuditLogs();
    expect(entry.action).toBe("billing.run");
    expect(entry.meta).toMatchObject({ renewed: 0, failed: 0, errors: 0 });
  });

  it("writes nothing for an action that failed", async () => {
    const result = await actions.suspendServerAction({ serverId: "does-not-exist" });
    expect(result).toMatchObject({ ok: false, error: "server_not_found" });

    const invalid = await actions.upsertCouponAction({ code: "x" });
    expect(invalid).toMatchObject({ ok: false, error: "validation" });

    expect(await listAuditLogs()).toHaveLength(0);
  });

  it("refuses to let an admin demote themselves, and does not log it", async () => {
    const result = await actions.setUserRoleAction({ userId: session.admin!.id, role: "USER" });

    expect(result).toMatchObject({ ok: false, error: "cannot_demote_self" });
    expect(await listAuditLogs()).toHaveLength(0);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: session.admin!.id } });
    expect(me.role).toBe("ADMIN");
  });

  it("does nothing at all for someone who is not an admin", async () => {
    const coupon = await createCoupon({ code: "KEEP" });
    session.admin = null;

    await expect(actions.deleteCouponAction(coupon.id)).rejects.toThrow("not an admin");

    expect(await prisma.coupon.count()).toBe(1);
    expect(await listAuditLogs()).toHaveLength(0);
  });

  it("keeps the trail when the admin account is later deleted", async () => {
    await actions.runBillingCycleAction();
    await prisma.user.delete({ where: { id: session.admin!.id } });

    const [entry] = await listAuditLogs();
    expect(entry.action).toBe("billing.run");
    expect(entry.actor).toBeNull();
  });
});
