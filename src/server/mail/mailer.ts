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

/**
 * Every email is written to the outbox first, then delivered if SMTP is
 * configured. Without SMTP (development) the outbox *is* the mailbox: read it
 * under Admin → Emails. Delivery problems are recorded on the row and never
 * thrown, because a mail server hiccup must not fail a checkout or a renewal.
 */
export async function sendEmail({ to, userId, template, email }: SendEmailInput) {
  const transport = getTransporter();

  const message = await prisma.emailMessage.create({
    data: {
      to,
      userId: userId ?? null,
      template,
      subject: email.subject,
      text: email.text,
      html: email.html,
      status: transport ? "SENT" : "LOGGED",
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

export async function listEmails(limit = 100) {
  return prisma.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export async function getEmail(id: string) {
  return prisma.emailMessage.findUnique({ where: { id } });
}
