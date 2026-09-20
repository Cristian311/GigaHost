"use server";

import { z } from "zod";
import { adminUpdateTicketSchema, createTicketSchema } from "@/lib/validation/ticket";
import { requireAdmin, requireUser } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import {
  adminUpdateTicket,
  closeTicketByUser,
  createTicket,
} from "@/server/services/ticket-service";
import type { ActionResult } from "./servers";

// Messages are sent through POST /api/tickets/[id]/messages instead of an
// action, so a reply never triggers a full page re-render mid-conversation.

const idSchema = z.string().min(1);

function fail(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { ok: false, error: "validation", details: z.flattenError(error) };
  }
  if (error instanceof AppError) {
    return { ok: false, error: error.code, details: error.details ?? error.message };
  }
  console.error(error);
  return { ok: false, error: "internal_error" };
}

export async function createTicketAction(
  input: unknown,
): Promise<ActionResult<{ ticketId: string }>> {
  const user = await requireUser();
  try {
    const ticket = await createTicket(user.id, createTicketSchema.parse(input));
    return { ok: true, data: { ticketId: ticket.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function closeTicketAction(ticketId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await closeTicketByUser(idSchema.parse(ticketId), user.id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function adminUpdateTicketAction(
  ticketId: string,
  input: unknown,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await adminUpdateTicket(idSchema.parse(ticketId), admin.id, adminUpdateTicketSchema.parse(input));
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
