import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";
import { APP_NAME } from "@/lib/constants";
import type { RenderedEmail, TemplateName } from "./templates";

let transporter: Transporter | null | undefined;

/** SMTP transport when SMTP_URL is set (smtp://user:pass@host:587), otherwise null. */
function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const url = process.env.SMTP_URL;
  transporter = url ? nodemailer.createTransport(url) : null;
  return transporter;
}

/** Tests replace the transport (or pass null to go back to outbox-only). */
export function setMailTransportForTests(next: Transporter | null | undefined) {
  transporter = next;
}

export type SendEmailInput = {
  to: string;
  userId?: string | null;
  template: TemplateName;
  email: RenderedEmail;
};

/** `?token=` / `&token=` followed by the single-use value. */
const TOKEN_IN_LINK = /([?&]token=)[A-Za-z0-9_-]+/g;

/**
 * Password-reset and verification tokens are stored hashed precisely so that
 * database access is not account access — but the email that carries the
 * plaintext link is kept in the outbox and shown under Admin → Emails, which
 * hands it back. Once SMTP is configured the customer has the real email, so
 * the copy only needs to prove what was sent.
 *
 * Without SMTP the outbox *is* the mailbox (development), so the link stays.
 */
function redactTokens(email: RenderedEmail): RenderedEmail {
  return {
    ...email,
    text: email.text.replace(TOKEN_IN_LINK, "$1REDACTED"),
    html: email.html.replace(TOKEN_IN_LINK, "$1REDACTED"),
  };
}

/**
 * Every email is written to the outbox first, then delivered if SMTP is
 * configured. Without SMTP (development) the outbox *is* the mailbox: read it
 * under Admin → Emails. Delivery problems are recorded on the row and never
 * thrown, because a mail server hiccup must not fail a checkout or a renewal.
 */
export async function sendEmail({ to, userId, template, email }: SendEmailInput) {
  const transport = getTransporter();
  const stored = transport ? redactTokens(email) : email;

  const message = await prisma.emailMessage.create({
    data: {
      to,
      userId: userId ?? null,
      template,
      subject: stored.subject,
      text: stored.text,
      html: stored.html,
      status: transport ? "SENT" : "LOGGED",
      attempts: transport ? 1 : 0,
    },
  });

  if (!transport) {
    if (process.env.NODE_ENV !== "test") {
      console.info(`[mail] ${template} -> ${to} (no SMTP_URL; see Admin → Emails)`);
    }
    return message;
  }

  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM ?? `${APP_NAME} <no-reply@localhost>`,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return message;
  } catch (error) {
    console.error(`[mail] delivery of ${template} to ${to} failed`, error);
    return prisma.emailMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", error: error instanceof Error ? error.message : String(error) },
    });
  }
}

/** Like sendEmail, but for call sites where the email is a side effect. */
export async function sendEmailSafely(input: SendEmailInput) {
  try {
    return await sendEmail(input);
  } catch (error) {
    console.error(`[mail] could not queue ${input.template} for ${input.to}`, error);
    return null;
  }
}

/** Give up after this many tries, so a permanently bad address is not retried forever. */
const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Re-sends emails whose delivery failed. Without this a transient SMTP problem
 * silently swallows a password reset or an invoice: the row is marked FAILED
 * and nothing ever looks at it again.
 *
 * Bodies of FAILED messages keep their links, because the message was never
 * delivered — redaction only applies once the customer has the real email.
 */
export async function retryFailedEmails(limit = 50) {
  const transport = getTransporter();
  if (!transport) return { retried: 0, delivered: 0, stillFailing: 0 };

  const failed = await prisma.emailMessage.findMany({
    where: { status: "FAILED", attempts: { lt: MAX_DELIVERY_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let stillFailing = 0;

  for (const message of failed) {
    try {
      await transport.sendMail({
        from: process.env.MAIL_FROM ?? `${APP_NAME} <no-reply@localhost>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      await prisma.emailMessage.update({
        where: { id: message.id },
        data: {
          status: "SENT",
          error: null,
          attempts: message.attempts + 1,
          // Delivered now, so the stored copy no longer needs the live link.
          ...redactTokens({ subject: message.subject, text: message.text, html: message.html }),
        },
      });
      delivered += 1;
    } catch (error) {
      stillFailing += 1;
      await prisma.emailMessage.update({
        where: { id: message.id },
        data: {
          attempts: message.attempts + 1,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return { retried: failed.length, delivered, stillFailing };
}

export async function listEmails(limit = 100) {
  return prisma.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export async function getEmail(id: string) {
  return prisma.emailMessage.findUnique({ where: { id } });
}
