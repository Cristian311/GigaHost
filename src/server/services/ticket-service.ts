import { prisma } from "@/lib/db";
import type { Prisma, Role, TicketKind, TicketStatus } from "@/generated/prisma/client";
import { nextStatusAfterMessage, STAFF_ONLINE_WINDOW_MS } from "@/lib/ticket-status";
import type {
  AdminUpdateTicketInput,
  CreateTicketInput,
  TicketMessageInput,
} from "@/lib/validation/ticket";
import { AppError } from "@/server/errors";

/** The signed-in user reading or writing a ticket. */
export type Viewer = { id: string; role: Role };

export const ticketMessageSelect = {
  id: true,
  body: true,
  isStaff: true,
  isInternal: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.TicketMessageSelect;

export type TicketMessageRecord = Prisma.TicketMessageGetPayload<{
  select: typeof ticketMessageSelect;
}>;

const LIST_LIMIT = 200;
const MESSAGE_LIMIT = 500;

// ---------------------------------------------------------------------------
// Customer side
// ---------------------------------------------------------------------------

export async function listTicketsForUser(userId: string) {
  return prisma.ticket.findMany({
    where: { userId, kind: "TICKET" },
    include: { server: { select: { id: true, name: true } } },
    orderBy: { lastMessageAt: "desc" },
    take: LIST_LIMIT,
  });
}

/** Servers a customer can link a ticket to (no provider round-trip). */
export async function listTicketServerOptions(userId: string) {
  return prisma.server.findMany({
    where: { ownerId: userId, status: { not: "DELETED" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTicketForUser(ticketId: string, userId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, userId },
    include: { server: { select: { id: true, name: true } } },
  });
  if (!ticket) throw new AppError("ticket_not_found", 404);
  return ticket;
}

export async function createTicket(userId: string, input: CreateTicketInput) {
  if (input.serverId) {
    const server = await prisma.server.findFirst({
      where: { id: input.serverId, ownerId: userId, status: { not: "DELETED" } },
      select: { id: true },
    });
    if (!server) throw new AppError("server_not_found", 404);
  }

  return prisma.ticket.create({
    data: {
      userId,
      kind: "TICKET",
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      serverId: input.serverId,
      status: "OPEN",
      awaitingStaff: true,
      messages: { create: { authorId: userId, body: input.body, isStaff: false } },
    },
  });
}

export async function findOpenChat(userId: string) {
  return prisma.ticket.findFirst({
    where: { userId, kind: "CHAT", status: { not: "CLOSED" } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Returns the customer's open live chat, creating an empty one if needed.
 * An empty chat is not awaiting staff, so it stays out of the admin queue
 * until the customer actually writes something.
 */
export async function getOrCreateChat(userId: string) {
  const existing = await findOpenChat(userId);
  if (existing) return existing;
  return prisma.ticket.create({
    data: {
      userId,
      kind: "CHAT",
      subject: "Live chat",
      category: "GENERAL",
      status: "OPEN",
      awaitingStaff: false,
    },
  });
}

export async function closeTicketByUser(ticketId: string, userId: string) {
  const ticket = await getTicketForUser(ticketId, userId);
  if (ticket.status === "CLOSED") return;
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date(), awaitingStaff: false },
  });
}

// ---------------------------------------------------------------------------
// Thread (customer and staff)
// ---------------------------------------------------------------------------

/** Admins can open any ticket; customers only their own. Never leaks existence. */
async function getAccessibleTicket(ticketId: string, viewer: Viewer) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || (viewer.role !== "ADMIN" && ticket.userId !== viewer.id)) {
    throw new AppError("ticket_not_found", 404);
  }
  return ticket;
}

/**
 * Messages in chronological order. `after` is inclusive so two messages
 * written in the same millisecond are never skipped; clients dedupe by id.
 */
export async function listMessages(ticketId: string, viewer: Viewer, after?: Date) {
  const ticket = await getAccessibleTicket(ticketId, viewer);
  const messages = await prisma.ticketMessage.findMany({
    where: {
      ticketId,
      ...(viewer.role === "ADMIN" ? {} : { isInternal: false }),
      ...(after ? { createdAt: { gte: after } } : {}),
    },
    select: ticketMessageSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MESSAGE_LIMIT,
  });
  return {
    ticket: { status: ticket.status, awaitingStaff: ticket.awaitingStaff },
    messages,
  };
}

export async function addMessage(ticketId: string, author: Viewer, input: TicketMessageInput) {
  const ticket = await getAccessibleTicket(ticketId, author);
  // An admin writing in a ticket they opened themselves is the customer there.
  const isStaff = author.role === "ADMIN" && ticket.userId !== author.id;
  if (ticket.status === "CLOSED" && !isStaff) throw new AppError("ticket_closed", 409);
  const isInternal = isStaff && input.isInternal;
  const createdAt = new Date();

  return prisma.$transaction(async (tx) => {
    const message = await tx.ticketMessage.create({
      data: { ticketId, authorId: author.id, body: input.body, isStaff, isInternal, createdAt },
      select: ticketMessageSelect,
    });
    // Internal notes are invisible to the customer, so they leave the queue alone.
    if (!isInternal) {
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          lastMessageAt: createdAt,
          awaitingStaff: !isStaff,
          status: nextStatusAfterMessage(ticket.status, isStaff),
          // The first staff member to answer picks the ticket up.
          ...(isStaff && !ticket.assigneeId ? { assigneeId: author.id } : {}),
        },
      });
    }
    return message;
  });
}

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------

export type TicketFilter = {
  status?: TicketStatus;
  kind?: TicketKind;
  needsReply?: boolean;
  q?: string;
};

export async function listAllTickets(filter: TicketFilter = {}) {
  const q = filter.q?.trim();
  const and: Prisma.TicketWhereInput[] = [
    // Chats the customer opened but never wrote in are noise.
    { OR: [{ kind: "TICKET" }, { messages: { some: {} } }] },
  ];
  if (filter.status) and.push({ status: filter.status });
  if (filter.kind) and.push({ kind: filter.kind });
  if (filter.needsReply) and.push({ awaitingStaff: true });
  if (q) {
    and.push({
      OR: [
        { subject: { contains: q } },
        { user: { email: { contains: q } } },
        { user: { name: { contains: q } } },
      ],
    });
  }

  return prisma.ticket.findMany({
    where: { AND: and },
    include: {
      user: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ awaitingStaff: "desc" }, { lastMessageAt: "desc" }],
    take: LIST_LIMIT,
  });
}

export async function countTicketsNeedingReply() {
  return prisma.ticket.count({ where: { awaitingStaff: true } });
}

export async function getTicketForAdmin(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      assignee: { select: { id: true, name: true, email: true } },
      server: { select: { id: true, name: true, status: true } },
    },
  });
  if (!ticket) throw new AppError("ticket_not_found", 404);
  return ticket;
}

export async function adminUpdateTicket(
  ticketId: string,
  adminId: string,
  input: AdminUpdateTicketInput,
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError("ticket_not_found", 404);

  const data: Prisma.TicketUncheckedUpdateInput = {};
  if (input.priority) data.priority = input.priority;
  if (input.status && input.status !== ticket.status) {
    data.status = input.status;
    if (input.status === "CLOSED") data.closedAt = new Date();
    else if (ticket.status === "CLOSED") data.closedAt = null;
    // Resolving or closing takes the ticket out of the "needs reply" queue.
    if (input.status === "RESOLVED" || input.status === "CLOSED") data.awaitingStaff = false;
  }
  if (input.assignToSelf !== undefined) data.assigneeId = input.assignToSelf ? adminId : null;

  await prisma.ticket.update({ where: { id: ticketId }, data });
}

// ---------------------------------------------------------------------------
// Staff presence for the live chat
// ---------------------------------------------------------------------------

export async function touchPresence(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
}

export async function isStaffOnline(now: Date = new Date()) {
  const online = await prisma.user.count({
    where: { role: "ADMIN", lastSeenAt: { gt: new Date(now.getTime() - STAFF_ONLINE_WINDOW_MS) } },
  });
  return online > 0;
}
