import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

const DIGITS = 6;

/** Numbers restart each year: GH-2026-000123. */
function currentPrefix(now: Date = new Date()): string {
  return `GH-${now.getUTCFullYear()}`;
}

function format(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(DIGITS, "0")}`;
}

/**
 * Highest number already issued under this prefix, for a database that predates
 * the counter. Numbers are zero-padded, so the lexically greatest is the
 * latest, and starting from the last number rather than a row count stays
 * correct after invoices have been deleted.
 */
async function highestIssued(prefix: string): Promise<number> {
  const last = await prisma.invoice.findFirst({
    where: { number: { startsWith: `${prefix}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  if (!last) return 0;
  const parsed = Number(last.number.slice(prefix.length + 1));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Next free number.
 *
 * The increment runs inside a transaction so the row lock taken by the UPDATE
 * is still held when the new value is read back; without it a second caller
 * could increment in between and both would be handed the same number. That
 * matters because in the resize flow the number is allocated *after* the card
 * has been charged, where a collision would take the money without recording
 * it.
 *
 * A number is consumed even if the caller then fails to write its invoice, so
 * the sequence can have gaps. Gaps are the right trade against duplicates here;
 * a gapless fiscal sequence is part of the invoicing work that is still to do.
 */
export async function nextInvoiceNumber(now: Date = new Date()): Promise<string> {
  const prefix = currentPrefix(now);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const claimed = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoiceCounter.findUnique({ where: { prefix } });
      if (!existing) return null;
      const row = await tx.invoiceCounter.update({
        where: { prefix },
        data: { next: { increment: 1 } },
      });
      return row.next;
    });

    if (claimed !== null) return format(prefix, claimed);

    // First invoice under this prefix. Seed from whatever is already stored so
    // an existing database keeps its numbering, then let the loop take a value.
    try {
      await prisma.invoiceCounter.create({
        data: { prefix, next: await highestIssued(prefix) },
      });
    } catch (error) {
      // Another caller seeded it first; the next pass will simply increment.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
    }
  }

  throw new Error(`Could not allocate an invoice number for ${prefix}.`);
}

/** True for a unique-constraint violation on the invoice number. */
export function isDuplicateInvoiceNumber(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  // MySQL reports the constraint name (`Invoice_number_key`); other engines
  // report the field list. Both mention the column.
  const target = error.meta?.target;
  const described = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return described.toLowerCase().includes("number") || described === "undefined";
}

/**
 * Runs `write` with a fresh invoice number.
 *
 * The counter makes a collision practically impossible, so the retry here is
 * only a backstop for numbers that pre-date the counter (a row inserted by hand
 * or restored from a backup).
 */
export async function claimInvoiceNumber<T>(write: (number: string) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const number = await nextInvoiceNumber();
    try {
      return await write(number);
    } catch (error) {
      if (attempt >= 5 || !isDuplicateInvoiceNumber(error)) throw error;
    }
  }
}

/**
 * Cancels renewal orders that were never paid and voids their invoices. Called
 * when a server goes away, so nobody is left owing money for it.
 */
export async function voidPendingRenewals(serverId: string) {
  const pending = await prisma.order.findMany({
    where: { serverId, kind: "RENEWAL", status: "PENDING" },
    select: { id: true },
  });
  if (pending.length === 0) return;
  const orderIds = pending.map((order) => order.id);

  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: "CANCELLED" },
    }),
    prisma.invoice.updateMany({
      where: { orderId: { in: orderIds }, status: "OPEN" },
      data: { status: "VOID" },
    }),
  ]);
}
