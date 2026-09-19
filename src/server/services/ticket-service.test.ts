import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  ticket: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  ticketMessage: { findMany: vi.fn(), create: vi.fn() },
  server: { findFirst: vi.fn() },
  user: { update: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  addMessage,
  adminUpdateTicket,
  closeTicketByUser,
  createTicket,
  getOrCreateChat,
  getTicketForUser,
  isStaffOnline,
  listMessages,
} from "./ticket-service";

const customer = { id: "u1", role: "USER" as const };
const otherCustomer = { id: "u2", role: "USER" as const };
const admin = { id: "a1", role: "ADMIN" as const };

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    userId: "u1",
    status: "OPEN",
    assigneeId: null,
    awaitingStaff: true,
    ...overrides,
  };
}

const newTicket = {
  subject: "Server will not start",
  category: "TECHNICAL" as const,
  priority: "NORMAL" as const,
  serverId: null,
  body: "It crashes on boot.",
};

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.ticketMessage.create.mockResolvedValue({ id: "m1" });
  db.ticket.update.mockResolvedValue({});
});

describe("createTicket", () => {
  it("rejects a server the customer does not own", async () => {
    db.server.findFirst.mockResolvedValue(null);
    await expect(createTicket("u1", { ...newTicket, serverId: "s9" })).rejects.toMatchObject({
      code: "server_not_found",
    });
    expect(db.server.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "s9", ownerId: "u1" }) }),
    );
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("creates the ticket with the first customer message, waiting on staff", async () => {
    db.ticket.create.mockResolvedValue({ id: "t1" });
    await createTicket("u1", newTicket);
    const { data } = db.ticket.create.mock.calls[0][0];
    expect(data).toMatchObject({
      userId: "u1",
      kind: "TICKET",
      status: "OPEN",
      awaitingStaff: true,
      serverId: null,
      messages: { create: { authorId: "u1", body: "It crashes on boot.", isStaff: false } },
    });
    expect(db.server.findFirst).not.toHaveBeenCalled();
  });
});

describe("getTicketForUser", () => {
  it("hides tickets that belong to someone else", async () => {
    db.ticket.findFirst.mockResolvedValue(null);
    await expect(getTicketForUser("t1", "u2")).rejects.toMatchObject({
      code: "ticket_not_found",
      status: 404,
    });
    expect(db.ticket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", userId: "u2" } }),
    );
  });
});

describe("closeTicketByUser", () => {
  it("closes the ticket and removes it from the staff queue", async () => {
    db.ticket.findFirst.mockResolvedValue(ticket());
    await closeTicketByUser("t1", "u1");
    expect(db.ticket.update.mock.calls[0][0].data).toMatchObject({
      status: "CLOSED",
      awaitingStaff: false,
      closedAt: expect.any(Date),
    });
  });
});

describe("addMessage", () => {
  it("hides another customer's ticket", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket());
    await expect(addMessage("t1", otherCustomer, { body: "hi", isInternal: false })).rejects.toMatchObject({
      code: "ticket_not_found",
    });
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("refuses customer replies on a closed ticket", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket({ status: "CLOSED" }));
    await expect(addMessage("t1", customer, { body: "hi", isInternal: false })).rejects.toMatchObject({
      code: "ticket_closed",
      status: 409,
    });
  });

  it("puts the ticket back in the staff queue on a customer reply", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket({ status: "PENDING", awaitingStaff: false }));
    await addMessage("t1", customer, { body: "still broken", isInternal: false });
    expect(db.ticketMessage.create.mock.calls[0][0].data).toMatchObject({
      authorId: "u1",
      isStaff: false,
      isInternal: false,
    });
    expect(db.ticket.update.mock.calls[0][0].data).toMatchObject({
      status: "OPEN",
      awaitingStaff: true,
      lastMessageAt: expect.any(Date),
    });
  });

  it("never lets a customer write an internal note", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket());
    await addMessage("t1", customer, { body: "sneaky", isInternal: true });
    expect(db.ticketMessage.create.mock.calls[0][0].data.isInternal).toBe(false);
    expect(db.ticket.update).toHaveBeenCalled();
  });

  it("marks a staff reply, waits on the customer and assigns the ticket", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket());
    await addMessage("t1", admin, { body: "try a restart", isInternal: false });
    expect(db.ticketMessage.create.mock.calls[0][0].data).toMatchObject({
      authorId: "a1",
      isStaff: true,
      isInternal: false,
    });
    expect(db.ticket.update.mock.calls[0][0].data).toMatchObject({
      status: "PENDING",
      awaitingStaff: false,
      assigneeId: "a1",
    });
  });

  it("keeps an existing assignee when another admin replies", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket({ assigneeId: "a2" }));
    await addMessage("t1", admin, { body: "hello", isInternal: false });
    expect(db.ticket.update.mock.calls[0][0].data).not.toHaveProperty("assigneeId");
  });

  it("stores internal notes without touching the ticket state", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket());
    await addMessage("t1", admin, { body: "looks like abuse", isInternal: true });
    expect(db.ticketMessage.create.mock.calls[0][0].data).toMatchObject({
      isStaff: true,
      isInternal: true,
    });
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("treats an admin in their own ticket as the customer", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket({ userId: "a1", status: "CLOSED" }));
    await expect(addMessage("t1", admin, { body: "hi", isInternal: true })).rejects.toMatchObject({
      code: "ticket_closed",
    });
  });
});

describe("listMessages", () => {
  it("filters internal notes for customers and uses an inclusive cursor", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket());
    db.ticketMessage.findMany.mockResolvedValue([]);
    const after = new Date("2026-09-15T10:00:00.000Z");
    const result = await listMessages("t1", customer, after);
    expect(db.ticketMessage.findMany.mock.calls[0][0].where).toEqual({
      ticketId: "t1",
      isInternal: false,
      createdAt: { gte: after },
    });
    expect(result.ticket).toEqual({ status: "OPEN", awaitingStaff: true });
  });

  it("shows internal notes to admins", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket());
    db.ticketMessage.findMany.mockResolvedValue([]);
    await listMessages("t1", admin);
    expect(db.ticketMessage.findMany.mock.calls[0][0].where).toEqual({ ticketId: "t1" });
  });
});

describe("getOrCreateChat", () => {
  it("reuses the open chat", async () => {
    db.ticket.findFirst.mockResolvedValue(ticket({ kind: "CHAT" }));
    const chat = await getOrCreateChat("u1");
    expect(chat.id).toBe("t1");
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("creates an empty chat that is not in the staff queue yet", async () => {
    db.ticket.findFirst.mockResolvedValue(null);
    db.ticket.create.mockResolvedValue({ id: "t2" });
    await getOrCreateChat("u1");
    expect(db.ticket.findFirst.mock.calls[0][0].where).toEqual({
      userId: "u1",
      kind: "CHAT",
      status: { not: "CLOSED" },
    });
    expect(db.ticket.create.mock.calls[0][0].data).toMatchObject({
      kind: "CHAT",
      awaitingStaff: false,
    });
  });
});

describe("adminUpdateTicket", () => {
  it("closing stamps closedAt and clears the queue flag", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket());
    await adminUpdateTicket("t1", "a1", { status: "CLOSED" });
    expect(db.ticket.update.mock.calls[0][0].data).toMatchObject({
      status: "CLOSED",
      closedAt: expect.any(Date),
      awaitingStaff: false,
    });
  });

  it("reopening clears closedAt", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket({ status: "CLOSED", awaitingStaff: false }));
    await adminUpdateTicket("t1", "a1", { status: "OPEN" });
    expect(db.ticket.update.mock.calls[0][0].data).toEqual({ status: "OPEN", closedAt: null });
  });

  it("assigns and unassigns the acting admin", async () => {
    db.ticket.findUnique.mockResolvedValue(ticket());
    await adminUpdateTicket("t1", "a1", { assignToSelf: true });
    await adminUpdateTicket("t1", "a1", { assignToSelf: false, priority: "HIGH" });
    expect(db.ticket.update.mock.calls[0][0].data).toEqual({ assigneeId: "a1" });
    expect(db.ticket.update.mock.calls[1][0].data).toEqual({ assigneeId: null, priority: "HIGH" });
  });

  it("throws for an unknown ticket", async () => {
    db.ticket.findUnique.mockResolvedValue(null);
    await expect(adminUpdateTicket("nope", "a1", { status: "OPEN" })).rejects.toMatchObject({
      code: "ticket_not_found",
    });
  });
});

describe("isStaffOnline", () => {
  it("counts admins seen within the last minute", async () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    db.user.count.mockResolvedValue(1);
    await expect(isStaffOnline(now)).resolves.toBe(true);
    expect(db.user.count.mock.calls[0][0].where).toEqual({
      role: "ADMIN",
      lastSeenAt: { gt: new Date("2026-09-15T11:59:00.000Z") },
    });
  });

  it("is offline when no admin is recent", async () => {
    db.user.count.mockResolvedValue(0);
    await expect(isStaffOnline()).resolves.toBe(false);
  });
});
