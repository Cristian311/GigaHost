import { prisma } from "@/lib/db";

/** Next free number of the form GH-2026-000123. */
export async function nextInvoiceNumber(): Promise<string> {
  const prefix = `GH-${new Date().getUTCFullYear()}-`;
  // Numbers are zero-padded, so the lexically greatest one is the latest. Going
  // from the last number rather than a row count keeps this correct after
  // invoices have been deleted.
  const last = await prisma.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const next = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
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
