import type { TicketStatus } from "@/generated/prisma/client";

/** A message as the thread component receives it (dates as ISO strings). */
export type ThreadMessage = {
  id: string;
  body: string;
  isStaff: boolean;
  isInternal: boolean;
  createdAt: string;
  author: { id: string; name: string | null };
};

/** Response of GET /api/tickets/[id]/messages. */
export type MessagesPayload = {
  ticket: { status: TicketStatus; awaitingStaff: boolean };
  messages: ThreadMessage[];
  staffOnline: boolean;
};

type MessageRecord = Omit<ThreadMessage, "createdAt"> & { createdAt: Date };

export function toThreadMessages(messages: MessageRecord[]): ThreadMessage[] {
  return messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() }));
}
