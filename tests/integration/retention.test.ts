import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Transporter } from "nodemailer";
import { prisma } from "@/lib/db";
import { retryFailedEmails, setMailTransportForTests } from "@/server/mail/mailer";
import {
  RETENTION_DAYS,
  purgeExpiredData,
} from "@/server/services/retention-service";
import { createServerFor, createUser, resetData } from "../setup/db";

const DAY_MS = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);

/** A transport whose sendMail behaviour the test controls. */
function transport(sendMail: Transporter["sendMail"]) {
  return { sendMail } as unknown as Transporter;
}

describe("data retention", () => {
  beforeEach(resetData);
  afterEach(() => setMailTransportForTests(undefined));

  describe("purging", () => {
    it("deletes records past their window and keeps the rest", async () => {
      const user = await createUser();

      await prisma.emailMessage.createMany({
        data: [
          {
            to: user.email,
            subject: "Old",
            template: "verifyEmail",
            text: "x",
            html: "x",
            status: "SENT",
            createdAt: ago(RETENTION_DAYS.emailMessages + 1),
          },
          {
            to: user.email,
            subject: "Recent",
            template: "verifyEmail",
            text: "x",
            html: "x",
            status: "SENT",
            createdAt: ago(1),
          },
        ],
      });

      const report = await purgeExpiredData();

      expect(report.emailMessages).toBe(1);
      const left = await prisma.emailMessage.findMany({ select: { subject: true } });
      expect(left.map((email) => email.subject)).toEqual(["Recent"]);
    });

    it("clears out expired sign-in and reset tokens", async () => {
      const user = await createUser();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: "expired-long-ago",
          expiresAt: ago(RETENTION_DAYS.expiredTokens + 1),
        },
      });
      await prisma.verificationToken.create({
        data: {
          identifier: user.email,
          token: "stale",
          expires: ago(RETENTION_DAYS.expiredTokens + 1),
        },
      });

      const report = await purgeExpiredData();

      expect(report.passwordResetTokens).toBe(1);
      expect(report.verificationTokens).toBe(1);
    });

    it("leaves a token that has not long expired, in case it is being used", async () => {
      const user = await createUser();
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: "recent", expiresAt: ago(1) },
      });

      const report = await purgeExpiredData();
      expect(report.passwordResetTokens).toBe(0);
    });

    it("never touches invoices, which are accounting records", async () => {
      const user = await createUser();
      await createServerFor(user.id);
      const before = await prisma.invoice.count();

      await purgeExpiredData();

      expect(await prisma.invoice.count()).toBe(before);
    });

    it("prunes old server activity but keeps recent entries", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await prisma.serverEvent.create({
        data: {
          serverId,
          type: "CREATED",
          createdAt: ago(RETENTION_DAYS.serverEvents + 1),
        },
      });
      const recent = await prisma.serverEvent.count();

      const report = await purgeExpiredData();

      expect(report.serverEvents).toBe(1);
      expect(await prisma.serverEvent.count()).toBe(recent - 1);
    });
  });

  describe("failed email retries", () => {
    it("re-sends a message that failed, and marks it sent", async () => {
      const user = await createUser();
      const failed = await prisma.emailMessage.create({
        data: {
          userId: user.id,
          to: user.email,
          subject: "Reset your password",
          template: "passwordReset",
          text: "Open https://gigahost.test/reset?token=abc123",
          html: "<a>https://gigahost.test/reset?token=abc123</a>",
          status: "FAILED",
          error: "connection refused",
          attempts: 1,
        },
      });

      const sendMail = vi.fn().mockResolvedValue({});
      setMailTransportForTests(transport(sendMail as unknown as Transporter["sendMail"]));

      const report = await retryFailedEmails();

      expect(report).toMatchObject({ retried: 1, delivered: 1, stillFailing: 0 });
      expect(sendMail).toHaveBeenCalledTimes(1);
      // The message that went out carries the working link.
      expect(sendMail.mock.calls[0][0].text).toContain("token=abc123");

      const after = await prisma.emailMessage.findUniqueOrThrow({ where: { id: failed.id } });
      expect(after.status).toBe("SENT");
      expect(after.error).toBeNull();
      expect(after.attempts).toBe(2);
      // Delivered, so the stored copy no longer needs the live token.
      expect(after.text).toContain("token=REDACTED");
    });

    it("counts a repeated failure rather than losing it", async () => {
      const user = await createUser();
      await prisma.emailMessage.create({
        data: {
          to: user.email,
          subject: "Nope",
          template: "passwordReset",
          text: "x",
          html: "x",
          status: "FAILED",
          attempts: 1,
        },
      });

      setMailTransportForTests(
        transport((async () => {
          throw new Error("still down");
        }) as unknown as Transporter["sendMail"]),
      );

      const report = await retryFailedEmails();

      expect(report).toMatchObject({ retried: 1, delivered: 0, stillFailing: 1 });
      const after = await prisma.emailMessage.findFirstOrThrow();
      expect(after.status).toBe("FAILED");
      expect(after.attempts).toBe(2);
      expect(after.error).toContain("still down");
    });

    it("gives up on a message that has failed too many times", async () => {
      const user = await createUser();
      await prisma.emailMessage.create({
        data: {
          to: user.email,
          subject: "Hopeless",
          template: "passwordReset",
          text: "x",
          html: "x",
          status: "FAILED",
          attempts: 5,
        },
      });

      const sendMail = vi.fn().mockResolvedValue({});
      setMailTransportForTests(transport(sendMail as unknown as Transporter["sendMail"]));

      const report = await retryFailedEmails();

      expect(report.retried).toBe(0);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it("does nothing at all without SMTP configured", async () => {
      setMailTransportForTests(null);
      expect(await retryFailedEmails()).toMatchObject({ retried: 0 });
    });
  });
});
