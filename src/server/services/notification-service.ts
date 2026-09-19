import { prisma } from "@/lib/db";
import { APP_URL } from "@/lib/constants";
import { formatMoney } from "@/lib/pricing/calculate-price";
import { sendEmailSafely } from "@/server/mail/mailer";
import { templates, type MailLocale } from "@/server/mail/templates";

/**
 * Transactional emails about servers and billing. Each function loads what it
 * needs from ids and never throws: a notification is a side effect, and the
 * checkout, renewal or state change that triggered it has already happened.
 */

const mailLocale = (locale: string | null | undefined): MailLocale =>
  locale === "ro" ? "ro" : "en";

const dateIn = (locale: MailLocale, date: Date) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);

async function guarded(label: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    console.error(`[notify] ${label} failed`, error);
  }
}

async function loadServer(serverId: string) {
  return prisma.server.findUnique({ where: { id: serverId }, include: { owner: true } });
}

export async function notifyOrderConfirmed(orderId: string) {
  await guarded("orderConfirmed", async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true, server: true, invoices: { orderBy: { issuedAt: "desc" }, take: 1 } },
    });
    const invoice = order?.invoices[0];
    if (!order?.server || !invoice) return;

    const locale = mailLocale(order.user.locale);
    await sendEmailSafely({
      to: order.user.email,
      userId: order.userId,
      template: "orderConfirmed",
      email: templates.orderConfirmed({
        locale,
        name: order.user.name,
        serverName: order.server.name,
        invoiceNumber: invoice.number,
        amount: formatMoney(invoice.amountCents, invoice.currency, locale),
        url: `${APP_URL}/${locale}/dashboard/servers/${order.server.id}`,
      }),
    });
  });
}

export async function notifyServerReady(serverId: string) {
  await guarded("serverReady", async () => {
    const server = await loadServer(serverId);
    if (!server) return;
    const locale = mailLocale(server.owner.locale);
    await sendEmailSafely({
      to: server.owner.email,
      userId: server.ownerId,
      template: "serverReady",
      email: templates.serverReady({
        locale,
        name: server.owner.name,
        serverName: server.name,
        address: server.ip && server.port ? `${server.ip}:${server.port}` : "—",
        url: `${APP_URL}/${locale}/dashboard/servers/${server.id}`,
      }),
    });
  });
}

export async function notifyRenewalPaid(orderId: string) {
  await guarded("renewalPaid", async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        server: { include: { subscription: true } },
        invoices: { orderBy: { issuedAt: "desc" }, take: 1 },
      },
    });
    const invoice = order?.invoices[0];
    const subscription = order?.server?.subscription;
    if (!order?.server || !invoice || !subscription) return;

    const locale = mailLocale(order.user.locale);
    await sendEmailSafely({
      to: order.user.email,
      userId: order.userId,
      template: "renewalPaid",
      email: templates.renewalPaid({
        locale,
        name: order.user.name,
        serverName: order.server.name,
        invoiceNumber: invoice.number,
        amount: formatMoney(invoice.amountCents, invoice.currency, locale),
        nextRenewal: dateIn(locale, subscription.currentPeriodEnd),
        url: `${APP_URL}/${locale}/dashboard/billing`,
      }),
    });
  });
}

export async function notifyPaymentFailed(serverId: string, amountCents: number, currency: string) {
  await guarded("paymentFailed", async () => {
    const server = await loadServer(serverId);
    if (!server) return;
    const locale = mailLocale(server.owner.locale);
    await sendEmailSafely({
      to: server.owner.email,
      userId: server.ownerId,
      template: "paymentFailed",
      email: templates.paymentFailed({
        locale,
        name: server.owner.name,
        serverName: server.name,
        amount: formatMoney(amountCents, currency, locale),
        url: `${APP_URL}/${locale}/dashboard/billing`,
      }),
    });
  });
}

export async function notifyServerSuspended(serverId: string) {
  await guarded("serverSuspended", async () => {
    const server = await loadServer(serverId);
    if (!server) return;
    const locale = mailLocale(server.owner.locale);
    await sendEmailSafely({
      to: server.owner.email,
      userId: server.ownerId,
      template: "serverSuspended",
      email: templates.serverSuspended({
        locale,
        name: server.owner.name,
        serverName: server.name,
        url: `${APP_URL}/${locale}/dashboard/billing`,
      }),
    });
  });
}

export async function notifyServerDeleted(serverId: string) {
  await guarded("serverDeleted", async () => {
    const server = await loadServer(serverId);
    if (!server) return;
    const locale = mailLocale(server.owner.locale);
    await sendEmailSafely({
      to: server.owner.email,
      userId: server.ownerId,
      template: "serverDeleted",
      email: templates.serverDeleted({
        locale,
        name: server.owner.name,
        serverName: server.name,
      }),
    });
  });
}
