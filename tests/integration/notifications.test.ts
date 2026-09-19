import type { Transporter } from "nodemailer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { sendEmail, setMailTransportForTests } from "@/server/mail/mailer";
import { escapeHtml, templates } from "@/server/mail/templates";
import type { ChargeFn } from "@/server/payments";
import { runBillingCycle } from "@/server/services/renewal-service";
import { getServerForUser } from "@/server/services/server-service";
import {
  ageServer,
  createServerFor,
  createUser,
  daysFromNow,
  endPeriod,
  outbox,
  resetData,
} from "../setup/db";

const decline: ChargeFn = async () => ({ status: "failed", reason: "card_declined" });
const approve: ChargeFn = async (request) => ({
  status: "succeeded",
  reference: `test_${request.idempotencyKey}`,
});

const templatesSent = async (to: string) => (await outbox(to)).map((email) => email.template);

describe("notifications", () => {
  beforeEach(resetData);
  afterEach(() => setMailTransportForTests(undefined));

  it("confirms the order with the invoice and the amount paid", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id, { name: "Skyblock" });

    const [email] = await outbox(user.email);
    expect(email.template).toBe("orderConfirmed");
    expect(email.subject).toBe("Order confirmed: Skyblock");
    expect(email.text).toMatch(/GH-\d{4}-\d{6}/);
    expect(email.text).toContain("€27.00");
    expect(email.text).toContain(`/en/dashboard/servers/${serverId}`);
  });

  it("writes in Romanian to customers who use the site in Romanian", async () => {
    const user = await createUser({ locale: "ro" });
    await createServerFor(user.id, { name: "Skyblock" });

    const [email] = await outbox(user.email);
    expect(email.subject).toBe("Comandă confirmată: Skyblock");
    // Romanian formatting writes the currency code rather than the symbol, after
    // a non-breaking space (which \s matches).
    expect(email.text).toMatch(/27,00\sEUR/);
    expect(email.text).toContain("/ro/dashboard/servers/");
  });

  it("says when the server has finished installing, once", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await ageServer(serverId, 11_000);

    const server = await getServerForUser(serverId, user.id);
    await getServerForUser(serverId, user.id);

    expect(await templatesSent(user.email)).toEqual(["orderConfirmed", "serverReady"]);
    const ready = (await outbox(user.email))[1];
    expect(ready.text).toContain(`${server.ip}:${server.port}`);
  });

  it("sends a receipt for each renewal", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await endPeriod(serverId);

    await runBillingCycle(new Date(), { charge: approve });

    const emails = await outbox(user.email);
    expect(emails.map((e) => e.template)).toEqual(["orderConfirmed", "renewalPaid"]);
    expect(emails[1].text).toContain("Next renewal:");
  });

  it("warns about a failed payment once, then about suspension and deletion", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await endPeriod(serverId);

    await runBillingCycle(new Date(), { charge: decline });
    await runBillingCycle(daysFromNow(1.1), { charge: decline });
    await runBillingCycle(daysFromNow(2.2), { charge: decline });
    // Three declined attempts, one email: the daily retries stay quiet.
    expect(await templatesSent(user.email)).toEqual(["orderConfirmed", "paymentFailed"]);

    await runBillingCycle(daysFromNow(3.3), { charge: decline });
    await runBillingCycle(daysFromNow(15), { charge: decline });

    expect(await templatesSent(user.email)).toEqual([
      "orderConfirmed",
      "paymentFailed",
      "serverSuspended",
      "serverDeleted",
    ]);
  });

  it("does not send the non-payment warning to a customer who cancelled", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await endPeriod(serverId);
    await prisma.subscription.update({ where: { serverId }, data: { cancelAtPeriodEnd: true } });

    await runBillingCycle(new Date(), { charge: approve });

    expect(await templatesSent(user.email)).toEqual(["orderConfirmed"]);
  });

  describe("delivery", () => {
    function transport(sendMail: Transporter["sendMail"]) {
      return { sendMail } as unknown as Transporter;
    }

    it("delivers through SMTP when it is configured", async () => {
      const sendMail = vi.fn(async () => ({}));
      setMailTransportForTests(transport(sendMail as unknown as Transporter["sendMail"]));

      const message = await sendEmail({
        to: "ana@test.local",
        template: "passwordChanged",
        email: templates.passwordChanged({ locale: "en", name: "Ana" }),
      });

      expect(message.status).toBe("SENT");
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "ana@test.local", subject: "Your password was changed" }),
      );
    });

    it("records a delivery failure instead of throwing", async () => {
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      setMailTransportForTests(
        transport((async () => {
          throw new Error("connection refused");
        }) as unknown as Transporter["sendMail"]),
      );

      const message = await sendEmail({
        to: "ana@test.local",
        template: "passwordChanged",
        email: templates.passwordChanged({ locale: "en", name: "Ana" }),
      });
      errorLog.mockRestore();

      expect(message).toMatchObject({ status: "FAILED", error: "connection refused" });
    });

    it("never lets a mail problem break a checkout", async () => {
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      setMailTransportForTests(
        transport((async () => {
          throw new Error("smtp is down");
        }) as unknown as Transporter["sendMail"]),
      );
      const user = await createUser();

      const { serverId } = await createServerFor(user.id);
      errorLog.mockRestore();

      expect(serverId).toBeTruthy();
      expect((await outbox(user.email))[0].status).toBe("FAILED");
    });
  });

  describe("templates", () => {
    it("escape what customers typed", () => {
      const email = templates.orderConfirmed({
        locale: "en",
        name: "<b>Eve</b>",
        serverName: '<script>alert("x")</script>',
        invoiceNumber: "GH-2026-000001",
        amount: "€1.00",
        url: "https://gigahost.test/x",
      });

      expect(email.html).not.toContain("<script>");
      expect(email.html).not.toContain("<b>Eve</b>");
      expect(email.html).toContain("&lt;script&gt;");
      // The plain-text part carries the name as typed.
      expect(email.text).toContain('<script>alert("x")</script>');
    });

    it("escapes every HTML-significant character", () => {
      expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
        "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
      );
    });

    it("render in both languages with a text and an HTML part", () => {
      for (const locale of ["en", "ro"] as const) {
        const base = { locale, name: "Ana" };
        const rendered = [
          templates.verifyEmail({ ...base, url: "https://x.test/v" }),
          templates.passwordReset({ ...base, url: "https://x.test/r" }),
          templates.passwordChanged(base),
          templates.serverReady({ ...base, serverName: "S", address: "1.2.3.4:25565", url: "https://x.test/s" }),
          templates.paymentFailed({ ...base, serverName: "S", amount: "€1.00", url: "https://x.test/b" }),
          templates.serverSuspended({ ...base, serverName: "S", url: "https://x.test/b" }),
          templates.serverDeleted({ ...base, serverName: "S" }),
        ];
        for (const email of rendered) {
          expect(email.subject.length).toBeGreaterThan(5);
          expect(email.text).toContain("Ana");
          expect(email.html).toContain("<!doctype html>");
        }
      }
    });
  });
});
