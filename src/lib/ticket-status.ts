import type { TicketPriority, TicketStatus } from "@/generated/prisma/client";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const TICKET_STATUS_VARIANT: Record<TicketStatus, BadgeVariant> = {
  OPEN: "default",
  PENDING: "secondary",
  RESOLVED: "outline",
  CLOSED: "outline",
};

export const TICKET_PRIORITY_VARIANT: Record<TicketPriority, BadgeVariant> = {
  LOW: "outline",
  NORMAL: "secondary",
  HIGH: "destructive",
};

/** An admin counts as online when their heartbeat is newer than this. */
export const STAFF_ONLINE_WINDOW_MS = 60_000;
/** How often admin pages send a heartbeat and clients re-check presence. */
export const PRESENCE_INTERVAL_MS = 30_000;

/**
 * Status after a public (non-internal) message: a customer message puts the
 * ticket back in the staff queue, a staff reply waits on the customer.
 * Closed tickets stay closed until an admin reopens them.
 */
export function nextStatusAfterMessage(current: TicketStatus, fromStaff: boolean): TicketStatus {
  if (current === "CLOSED") return current;
  return fromStaff ? "PENDING" : "OPEN";
}

export function canCustomerReply(status: TicketStatus): boolean {
  return status !== "CLOSED";
}
