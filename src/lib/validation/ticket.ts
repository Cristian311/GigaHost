import { z } from "zod";

export const TICKET_CATEGORIES = ["GENERAL", "TECHNICAL", "BILLING", "ABUSE"] as const;
export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const TICKET_STATUSES = ["OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;

export const ticketCategorySchema = z.enum(TICKET_CATEGORIES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);

const messageBody = z.string().trim().min(1).max(5000);

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema.default("NORMAL"),
  /** Empty string or null from the form means "no specific server". */
  serverId: z
    .string()
    .max(64)
    .nullish()
    .transform((value) => value || null),
  body: messageBody,
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const ticketMessageSchema = z.object({
  body: messageBody,
  /** Staff-only note; ignored for customers. */
  isInternal: z.boolean().default(false),
});

export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;

export const adminUpdateTicketSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  /** true assigns the ticket to the acting admin, false clears the assignee. */
  assignToSelf: z.boolean().optional(),
});

export type AdminUpdateTicketInput = z.infer<typeof adminUpdateTicketSchema>;

export const messagesQuerySchema = z.object({
  after: z.iso.datetime().optional(),
});
