import { prisma } from "@/lib/db";

export type AuditAction =
  | "pricing.update"
  | "game.upsert"
  | "game.delete"
  | "region.upsert"
  | "region.delete"
  | "coupon.upsert"
  | "coupon.delete"
  | "server.suspend"
  | "server.unsuspend"
  | "user.role"
  | "billing.run";

export type AuditEntry = {
  actorId: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
};

/**
 * Records who did what in the admin area. Like the activity log it never
 * throws: failing to write the trail must not undo the change it describes.
 */
export async function recordAudit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    console.error(`Could not write audit entry ${entry.action}`, error);
  }
}

export type AuditLogView = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: Date;
  actor: { email: string; name: string | null } | null;
};

export async function listAuditLogs(limit = 100): Promise<AuditLogView[]> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { email: true, name: true } } },
  });
  return rows.map((row) => {
    let meta: unknown = null;
    if (row.meta) {
      try {
        meta = JSON.parse(row.meta);
      } catch {
        meta = row.meta;
      }
    }
    return { ...row, meta };
  });
}
