import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import { getProvider } from "@/server/providers";
import { recordEvent } from "./event-service";
import { toRef } from "./server-service";

/**
 * GDPR article 15 (access) and article 20 (portability): a copy of everything
 * held about the person, in a structured, machine-readable form, without them
 * having to ask a human.
 *
 * Deliberately shaped for a reader rather than for re-import: this is the
 * answer to "what do you know about me", so it names things the way the site
 * does and leaves out internal identifiers that would mean nothing.
 */
export async function exportAccountData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      servers: {
        include: {
          subscription: true,
          events: { orderBy: { createdAt: "asc" } },
          backups: true,
        },
      },
      orders: { include: { invoices: true } },
      subscriptions: true,
      invoices: true,
      tickets: { include: { messages: { orderBy: { createdAt: "asc" } } } },
      couponRedemptions: { include: { coupon: { select: { code: true } } } },
      accounts: { select: { provider: true, providerAccountId: true } },
      emails: {
        orderBy: { createdAt: "asc" },
        select: { to: true, subject: true, template: true, status: true, createdAt: true },
      },
    },
  });
  if (!user) throw new AppError("not_found", 404);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      language: user.locale,
      role: user.role,
      termsAcceptedAt: user.termsAcceptedAt,
      termsVersion: user.termsVersion,
      createdAt: user.createdAt,
      // Sign-in providers, without the tokens that go with them.
      linkedLogins: user.accounts.map((account) => ({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      })),
    },
    servers: user.servers.map((server) => ({
      name: server.name,
      game: server.gameId,
      region: server.regionId,
      status: server.status,
      resources: { ramGb: server.ramGb, vcpu: server.vcpu, storageGb: server.storageGb },
      address: server.ip ? `${server.ip}:${server.port}` : null,
      createdAt: server.createdAt,
      subscription: server.subscription && {
        status: server.subscription.status,
        billingPeriod: server.subscription.billingPeriod,
        amountCents: server.subscription.amountCents,
        currency: server.subscription.currency,
        currentPeriodStart: server.subscription.currentPeriodStart,
        currentPeriodEnd: server.subscription.currentPeriodEnd,
      },
      backups: server.backups.map((backup) => ({
        name: backup.name,
        sizeMb: backup.sizeMb,
        createdAt: backup.createdAt,
      })),
      activity: server.events.map((event) => ({
        type: event.type,
        message: event.message,
        at: event.createdAt,
      })),
    })),
    orders: user.orders.map((order) => ({
      kind: order.kind,
      status: order.status,
      billingPeriod: order.billingPeriod,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      couponDiscountCents: order.couponDiscountCents,
      totalCents: order.totalCents,
      currency: order.currency,
      withdrawalWaivedAt: order.withdrawalWaivedAt,
      createdAt: order.createdAt,
      invoices: order.invoices.map((invoice) => ({
        number: invoice.number,
        status: invoice.status,
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        issuedAt: invoice.issuedAt,
        paidAt: invoice.paidAt,
      })),
    })),
    couponsUsed: user.couponRedemptions.map((redemption) => ({
      code: redemption.coupon.code,
      amountCents: redemption.amountCents,
      at: redemption.createdAt,
    })),
    supportTickets: user.tickets.map((ticket) => ({
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
      messages: ticket.messages
        // Staff-only notes were never shown to the customer and are not theirs.
        .filter((message) => !message.isInternal)
        .map((message) => ({
          from: message.isStaff ? "support" : "you",
          body: message.body,
          at: message.createdAt,
        })),
    })),
    emailsSentToYou: user.emails,
  };
}

export type AccountExport = Awaited<ReturnType<typeof exportAccountData>>;

/**
 * GDPR article 17 (erasure).
 *
 * Two things make this more than a `DELETE`. Servers exist outside the database
 * and have to be torn down at the provider first, or the customer stops paying
 * for infrastructure that keeps running. And invoices are accounting records
 * that Romanian law requires be kept, so the right to erasure does not reach
 * them: they are detached from the person instead, keeping the figures while
 * losing the link.
 */
export async function deleteAccount(userId: string, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { servers: true },
  });
  if (!user) throw new AppError("not_found", 404);
  if (user.role === "ADMIN") {
    // An admin deleting themselves could leave nobody able to administer.
    throw new AppError("cannot_demote_self", 409, "An admin account cannot be deleted here.");
  }

  // Outside the database first: a failure here must stop the deletion rather
  // than orphan a running server nobody is billed for.
  for (const server of user.servers) {
    const ref = toRef(server);
    if (!ref) continue;
    await getProvider().deleteServer(ref);
    await recordEvent(server.id, "DELETED", "Account closed");
  }

  await prisma.$transaction(async (tx) => {
    // Kept for accounting, anonymised so they are no longer personal data.
    // The relation is required, so they are pointed at a placeholder rather
    // than left dangling.
    const placeholder = await tx.user.upsert({
      where: { email: DELETED_USER_EMAIL },
      update: {},
      create: {
        email: DELETED_USER_EMAIL,
        name: "Deleted account",
        role: "USER",
        emailVerified: now,
      },
    });

    await tx.invoice.updateMany({ where: { userId }, data: { userId: placeholder.id } });
    await tx.order.updateMany({ where: { userId }, data: { userId: placeholder.id } });

    // Everything else cascades from the user row.
    await tx.user.delete({ where: { id: userId } });
  });

  return { deletedServers: user.servers.length };
}

/**
 * Holder of records that outlive the person. Never logged into: it has no
 * password hash and no linked provider, so there is no way to authenticate as
 * it.
 */
export const DELETED_USER_EMAIL = "deleted@account.invalid";
