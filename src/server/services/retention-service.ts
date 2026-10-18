import { prisma } from "@/lib/db";

const DAY_MS = 86_400_000;

/**
 * How long each kind of record is kept. Nothing here was ever deleted, so a
 * long-running instance would grow without bound — and, worse, would keep
 * personal data (email bodies, addresses in the audit log, console output)
 * indefinitely, which GDPR's storage limitation principle does not allow.
 *
 * The numbers are a starting point, not a legal opinion. Invoices, orders and
 * subscriptions are deliberately absent: those are financial records with their
 * own retention rules and must not be swept up here.
 */
export const RETENTION_DAYS = {
  /** Sent copies. The customer has the real email; this is an audit trail. */
  emailMessages: 90,
  /** Who changed what in the admin area. */
  auditLog: 365,
  /** Per-server activity feed shown to the customer. */
  serverEvents: 180,
  /** Console output, which is large and only useful while it is recent. */
  consoleEntries: 30,
  /** Single-use tokens are worthless once expired; keep a short grace period. */
  expiredTokens: 7,
} as const;

export type RetentionReport = {
  emailMessages: number;
  auditLog: number;
  serverEvents: number;
  consoleEntries: number;
  verificationTokens: number;
  passwordResetTokens: number;
};

function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Deletes records that are past their retention window. Runs from the billing
 * scheduler; deleting in batches is not needed yet, but every query is indexed
 * on the column it filters.
 */
export async function purgeExpiredData(now: Date = new Date()): Promise<RetentionReport> {
  const tokenCutoff = cutoff(now, RETENTION_DAYS.expiredTokens);

  const [
    emailMessages,
    auditLog,
    serverEvents,
    consoleEntries,
    verificationTokens,
    passwordResetTokens,
  ] = await Promise.all([
    prisma.emailMessage.deleteMany({
      where: { createdAt: { lt: cutoff(now, RETENTION_DAYS.emailMessages) } },
    }),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff(now, RETENTION_DAYS.auditLog) } },
    }),
    prisma.serverEvent.deleteMany({
      where: { createdAt: { lt: cutoff(now, RETENTION_DAYS.serverEvents) } },
    }),
    prisma.consoleEntry.deleteMany({
      where: { createdAt: { lt: cutoff(now, RETENTION_DAYS.consoleEntries) } },
    }),
    // Auth.js names this column `expires`, not `expiresAt`.
    prisma.verificationToken.deleteMany({ where: { expires: { lt: tokenCutoff } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: tokenCutoff } } }),
  ]);

  return {
    emailMessages: emailMessages.count,
    auditLog: auditLog.count,
    serverEvents: serverEvents.count,
    consoleEntries: consoleEntries.count,
    verificationTokens: verificationTokens.count,
    passwordResetTokens: passwordResetTokens.count,
  };
}
