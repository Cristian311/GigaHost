import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import { MockProvider } from "@/server/providers/mock-provider";
import { setProviderForTests } from "@/server/providers";
import type { ProvisionInput, ProvisionResult, ServerProvider } from "@/server/providers/types";
import { createOrder, fulfilOrder } from "@/server/services/order-service";
import { retryProvisioning } from "@/server/services/server-service";
import { createUser, outbox, resetData } from "../setup/db";

const ORDER_INPUT = {
  name: "Unlucky server",
  gameSlug: "minecraft-paper",
  ramGb: 8,
  vcpu: 4,
  storageGb: 50,
  regionCode: "eu-ro",
  billingPeriod: "MONTHLY",
  waiveWithdrawal: true,
} as const;

/** The mock, but createServer fails until `failures` attempts have been used up. */
function flakyProvider(failures: number) {
  const base = new MockProvider();
  let remaining = failures;
  const provider = Object.assign(Object.create(Object.getPrototypeOf(base)), base, {
    async createServer(input: ProvisionInput): Promise<ProvisionResult> {
      if (remaining > 0) {
        remaining -= 1;
        throw new AppError("no_capacity", 409, "No node has room right now.");
      }
      return MockProvider.prototype.createServer.call(base, input);
    },
  }) as ServerProvider;
  return provider;
}

/**
 * A customer whose payment went through but whose server did not build used to
 * have no way forward: no retry, no alert, just a row in ERROR that only they
 * would notice.
 */
describe("provisioning recovery", () => {
  beforeEach(resetData);
  afterEach(() => setProviderForTests(undefined));

  async function paidButFailed() {
    const user = await createUser();
    setProviderForTests(flakyProvider(1));
    const order = await createOrder(user.id, ORDER_INPUT);
    const { serverId } = await fulfilOrder(order.id);
    return { user, order, serverId };
  }

  it("still records the payment when the build fails", async () => {
    const { order, serverId } = await paidButFailed();

    // The money was taken, so the invoice and subscription must exist anyway.
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server.status).toBe("ERROR");
    expect(server.lastError).toContain("No node has room");
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.subscription.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("tells the operator, not just the log", async () => {
    const admin = await createUser({ role: "ADMIN", email: "ops@gigahost.test" });
    setProviderForTests(flakyProvider(1));
    const user = await createUser();
    const order = await createOrder(user.id, ORDER_INPUT);
    await fulfilOrder(order.id);

    const alerts = (await outbox(admin.email)).filter(
      (email) => email.template === "provisioningFailed",
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain(user.email);
    expect(alerts[0].text).toContain("No node has room");
  });

  it("builds the server on a retry", async () => {
    const { serverId } = await paidButFailed();

    const retried = await retryProvisioning(serverId);

    expect(retried.status).toBe("INSTALLING");
    expect(retried.providerId).toBeTruthy();
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server.lastError).toBeNull();
  });

  it("keeps the resources the customer paid for", async () => {
    const { serverId } = await paidButFailed();
    await retryProvisioning(serverId);

    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server).toMatchObject({ ramGb: 8, vcpu: 4, storageGb: 50 });
  });

  it("records the retry in the server's activity", async () => {
    const { serverId } = await paidButFailed();
    await retryProvisioning(serverId);

    const events = await prisma.serverEvent.findMany({ where: { serverId } });
    expect(events.some((event) => event.message === "Retrying provisioning")).toBe(true);
  });

  it("refuses to retry a server that is not in error", async () => {
    const { serverId } = await paidButFailed();
    await retryProvisioning(serverId);

    // Now it exists on the provider; a second retry would build a duplicate.
    await expect(retryProvisioning(serverId)).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });

  it("reports a server that is not there", async () => {
    await expect(retryProvisioning("nope")).rejects.toMatchObject({ code: "server_not_found" });
  });
});
