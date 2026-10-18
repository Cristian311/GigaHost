import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import {
  DELETED_USER_EMAIL,
  deleteAccount,
  exportAccountData,
} from "@/server/services/account-data-service";
import { createTicket, addMessage } from "@/server/services/ticket-service";
import { createServerFor, createUser, resetData } from "../setup/db";

/**
 * GDPR articles 15, 20 and 17. Erasure in particular destroys real things, so
 * what it keeps and what it removes is worth pinning down precisely.
 */
describe("account data", () => {
  beforeEach(async () => {
    await resetData();
    await prisma.user.deleteMany({ where: { email: DELETED_USER_EMAIL } });
  });

  describe("export", () => {
    it("includes the account, its servers, orders and invoices", async () => {
      const user = await createUser({ email: "export@test.local" });
      await createServerFor(user.id, { name: "Exported server" });

      const data = await exportAccountData(user.id);

      expect(data.account).toMatchObject({ email: "export@test.local", language: "en" });
      expect(data.servers).toHaveLength(1);
      expect(data.servers[0]).toMatchObject({ name: "Exported server" });
      expect(data.orders).toHaveLength(1);
      expect(data.orders[0].invoices).toHaveLength(1);
      expect(data.exportedAt).toEqual(expect.any(String));
    });

    it("carries support conversations but not staff-only notes", async () => {
      const user = await createUser();
      const admin = await createUser({ role: "ADMIN" });
      const ticket = await createTicket(user.id, {
        subject: "Help please",
        body: "My server will not start",
        category: "TECHNICAL",
        priority: "NORMAL",
        serverId: null,
      });
      await addMessage(ticket.id, { id: admin.id, role: "ADMIN" }, {
        body: "Internal: check node 3",
        isInternal: true,
      });

      const data = await exportAccountData(user.id);

      const bodies = data.supportTickets[0].messages.map((message) => message.body);
      expect(bodies).toContain("My server will not start");
      // An internal note was never shown to the customer and is not their data.
      expect(bodies).not.toContain("Internal: check node 3");
    });

    it("never leaks another account's data", async () => {
      const mine = await createUser();
      const theirs = await createUser();
      await createServerFor(theirs.id, { name: "Not mine" });

      const data = await exportAccountData(mine.id);
      expect(data.servers).toHaveLength(0);
      expect(data.orders).toHaveLength(0);
    });

    it("does not include password hashes or provider tokens", async () => {
      const user = await createUser();
      const serialised = JSON.stringify(await exportAccountData(user.id));
      expect(serialised).not.toContain("passwordHash");
      expect(serialised).not.toContain("access_token");
    });
  });

  describe("deletion", () => {
    it("removes the account and its servers", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);

      const result = await deleteAccount(user.id);

      expect(result.deletedServers).toBe(1);
      expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
      expect(await prisma.server.findUnique({ where: { id: serverId } })).toBeNull();
    });

    it("keeps the invoices, detached from the person", async () => {
      const user = await createUser();
      await createServerFor(user.id);
      const before = await prisma.invoice.findMany({ where: { userId: user.id } });
      expect(before).toHaveLength(1);

      await deleteAccount(user.id);

      // Accounting records have their own retention rules, so erasure takes the
      // identity off them rather than removing them.
      const after = await prisma.invoice.findUnique({ where: { id: before[0].id } });
      expect(after).not.toBeNull();
      expect(after?.userId).not.toBe(user.id);

      const holder = await prisma.user.findUniqueOrThrow({
        where: { email: DELETED_USER_EMAIL },
      });
      expect(after?.userId).toBe(holder.id);
      expect(holder.passwordHash).toBeNull();
    });

    it("reuses one placeholder for every deleted account", async () => {
      for (let i = 0; i < 2; i += 1) {
        const user = await createUser();
        await createServerFor(user.id);
        await deleteAccount(user.id);
      }
      const holders = await prisma.user.findMany({ where: { email: DELETED_USER_EMAIL } });
      expect(holders).toHaveLength(1);
      expect(await prisma.invoice.count({ where: { userId: holders[0].id } })).toBe(2);
    });

    it("removes support tickets with the account", async () => {
      const user = await createUser();
      const ticket = await createTicket(user.id, { subject: "Bye", body: "Closing up", category: "GENERAL", priority: "NORMAL", serverId: null });

      await deleteAccount(user.id);

      expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
    });

    it("refuses to delete an admin, which could leave nobody in charge", async () => {
      const admin = await createUser({ role: "ADMIN" });
      await expect(deleteAccount(admin.id)).rejects.toBeInstanceOf(AppError);
      expect(await prisma.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
    });

    it("reports a missing account rather than silently succeeding", async () => {
      await expect(deleteAccount("does-not-exist")).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });
});
