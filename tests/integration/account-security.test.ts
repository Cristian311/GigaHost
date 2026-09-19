import { compare } from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashToken } from "@/server/security/tokens";
import {
  assertEmailVerified,
  isResetTokenValid,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
} from "@/server/services/account-security-service";
import { changePassword, registerUser } from "@/server/services/user-service";
import { createUser, outbox, resetData, tokenFromEmail } from "../setup/db";

const HOUR = 3_600_000;

describe("email verification", () => {
  beforeEach(resetData);

  it("emails a confirmation link on sign-up, in the customer's language", async () => {
    const user = await registerUser({
      name: "Ana",
      email: "ana@test.local",
      password: "password1234",
      locale: "ro",
    });

    expect(user.emailVerified).toBeNull();
    const [email] = await outbox("ana@test.local");
    expect(email).toMatchObject({ template: "verifyEmail", status: "LOGGED", userId: user.id });
    expect(email.subject).toBe("Confirmă adresa de email");
    expect(email.text).toContain("/ro/verify-email?token=");
  });

  it("confirms the address with the emailed token", async () => {
    const user = await createUser({ verified: false });
    await sendVerificationEmail(user.id);
    const [email] = await outbox(user.email);

    const verified = await verifyEmail(tokenFromEmail(email));

    expect(verified.id).toBe(user.id);
    expect(verified.emailVerified).toBeInstanceOf(Date);
  });

  it("stores only a hash of the token", async () => {
    const user = await createUser({ verified: false });
    await sendVerificationEmail(user.id);
    const token = tokenFromEmail((await outbox(user.email))[0]);

    const stored = await prisma.verificationToken.findFirstOrThrow({
      where: { identifier: user.email },
    });
    expect(stored.token).not.toBe(token);
    expect(stored.token).toBe(hashToken(token));
  });

  it("accepts a token once", async () => {
    const user = await createUser({ verified: false });
    await sendVerificationEmail(user.id);
    const token = tokenFromEmail((await outbox(user.email))[0]);

    await verifyEmail(token);
    await expect(verifyEmail(token)).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects unknown and expired tokens", async () => {
    const user = await createUser({ verified: false });
    await sendVerificationEmail(user.id);
    const token = tokenFromEmail((await outbox(user.email))[0]);

    await expect(verifyEmail("not-a-real-token")).rejects.toMatchObject({ code: "invalid_token" });
    await expect(verifyEmail(token, new Date(Date.now() + 25 * HOUR))).rejects.toMatchObject({
      code: "invalid_token",
    });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerified).toBeNull();
  });

  it("invalidates the previous link when a new one is sent", async () => {
    const user = await createUser({ verified: false });
    await sendVerificationEmail(user.id);
    await sendVerificationEmail(user.id);
    const [first, second] = await outbox(user.email);

    await expect(verifyEmail(tokenFromEmail(first))).rejects.toMatchObject({
      code: "invalid_token",
    });
    await expect(verifyEmail(tokenFromEmail(second))).resolves.toBeTruthy();
  });

  it("does not resend to an address that is already confirmed", async () => {
    const user = await createUser();
    await expect(sendVerificationEmail(user.id)).rejects.toMatchObject({
      code: "already_verified",
    });
  });

  it("blocks ordering until the address is confirmed", async () => {
    const unverified = await createUser({ verified: false });
    const verified = await createUser();

    await expect(assertEmailVerified(unverified.id)).rejects.toMatchObject({
      code: "email_not_verified",
      status: 403,
    });
    await expect(assertEmailVerified(verified.id)).resolves.toBeUndefined();
  });

  it("can be switched off for deployments that do not want it", async () => {
    const unverified = await createUser({ verified: false });
    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    try {
      await expect(assertEmailVerified(unverified.id)).resolves.toBeUndefined();
    } finally {
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
    }
  });
});

describe("password reset", () => {
  beforeEach(resetData);

  async function requestFor(email: string) {
    await requestPasswordReset(email);
    const emails = await outbox(email);
    return tokenFromEmail(emails[emails.length - 1]);
  }

  it("sets a new password through the emailed link", async () => {
    const user = await createUser();
    const token = await requestFor(user.email);

    expect(await isResetTokenValid(token)).toBe(true);
    await resetPassword(token, "a-brand-new-password");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await compare("a-brand-new-password", after.passwordHash!)).toBe(true);
    expect(await compare("password1234", after.passwordHash!)).toBe(false);
  });

  it("signs out every existing session", async () => {
    const user = await createUser();
    const token = await requestFor(user.email);

    await resetPassword(token, "a-brand-new-password");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.sessionVersion).toBe(user.sessionVersion + 1);
  });

  it("tells the customer their password changed", async () => {
    const user = await createUser({ locale: "ro" });
    const token = await requestFor(user.email);

    await resetPassword(token, "a-brand-new-password");

    const emails = await outbox(user.email);
    expect(emails.map((e) => e.template)).toEqual(["passwordReset", "passwordChanged"]);
    expect(emails[1].subject).toBe("Parola ta a fost schimbată");
  });

  it("works once, and stores only a hash", async () => {
    const user = await createUser();
    const token = await requestFor(user.email);

    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).toBe(hashToken(token));

    await resetPassword(token, "a-brand-new-password");
    expect(await isResetTokenValid(token)).toBe(false);
    await expect(resetPassword(token, "another-password-1")).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("expires after an hour", async () => {
    const user = await createUser();
    const token = await requestFor(user.email);
    const later = new Date(Date.now() + HOUR + 1000);

    expect(await isResetTokenValid(token, later)).toBe(false);
    await expect(resetPassword(token, "a-brand-new-password", later)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("only honours the most recent link", async () => {
    const user = await createUser();
    const first = await requestFor(user.email);
    const second = await requestFor(user.email);

    await expect(resetPassword(first, "a-brand-new-password")).rejects.toMatchObject({
      code: "invalid_token",
    });
    await expect(resetPassword(second, "a-brand-new-password")).resolves.toBeUndefined();
  });

  it("does not reveal whether an address has an account", async () => {
    await expect(requestPasswordReset("nobody@test.local")).resolves.toBeUndefined();
    expect(await outbox("nobody@test.local")).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("skips accounts that have no password (Google / Discord sign-in)", async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: null } });

    await requestPasswordReset(user.email);

    expect(await outbox(user.email)).toHaveLength(0);
  });

  it("confirms the address, since opening the link proves control of the mailbox", async () => {
    const user = await createUser({ verified: false });
    const token = await requestFor(user.email);

    await resetPassword(token, "a-brand-new-password");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerified).toBeInstanceOf(Date);
  });
});

describe("changing the password while signed in", () => {
  beforeEach(resetData);

  it("ends other sessions and sends a notice", async () => {
    const user = await createUser();

    await changePassword(user.id, "password1234", "a-brand-new-password");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.sessionVersion).toBe(user.sessionVersion + 1);
    expect((await outbox(user.email)).map((e) => e.template)).toEqual(["passwordChanged"]);
  });

  it("changes nothing when the current password is wrong", async () => {
    const user = await createUser();

    await expect(
      changePassword(user.id, "wrong-password", "a-brand-new-password"),
    ).rejects.toMatchObject({ code: "invalid_credentials" });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.sessionVersion).toBe(user.sessionVersion);
    expect(await outbox(user.email)).toHaveLength(0);
  });
});
