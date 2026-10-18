import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import type { ChargeFn } from "@/server/payments";
import { MockProvider } from "@/server/providers/mock-provider";
import { setProviderForTests } from "@/server/providers";
import type { ResourceSpec, ServerProvider, ServerRef } from "@/server/providers/types";
import { resizeServer } from "@/server/services/resize-service";
import { createServerFor, createUser, resetData, setStatus } from "../setup/db";

const approve = () =>
  vi.fn<ChargeFn>(async (request) => ({
    status: "succeeded",
    reference: `test_${request.idempotencyKey}`,
  }));
const decline = () => vi.fn<ChargeFn>(async () => ({ status: "failed", reason: "card_declined" }));

const BIGGER = { ramGb: 16, vcpu: 6, storageGb: 100 };
const SMALLER = { ramGb: 4, vcpu: 2, storageGb: 30 };

/** The mock, with resize recorded and optionally made to fail. */
function recordingProvider(options: { failOn?: (spec: ResourceSpec) => boolean } = {}) {
  const calls: ResourceSpec[] = [];
  const base = new MockProvider();
  const provider: ServerProvider = {
    ...base,
    name: "recording",
    capabilities: base.capabilities,
    async resize(_ref: ServerRef, spec: ResourceSpec) {
      calls.push({ ...spec });
      if (options.failOn?.(spec)) {
        throw new AppError("no_capacity", 409, "Node has no room to grow.");
      }
    },
  } as ServerProvider;
  // The mock keeps state on the instance, so its methods need their own `this`.
  Object.setPrototypeOf(provider, Object.getPrototypeOf(base));
  return { provider, calls };
}

/**
 * A resize used to charge the card and update the database while leaving the
 * panel untouched, so the customer paid for resources they never received.
 * These pin down that the provider is called, and in what order.
 */
describe("resize reaches the provider", () => {
  beforeEach(resetData);
  afterEach(() => setProviderForTests(undefined));

  it("applies the new limits to the server", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");
    const { provider, calls } = recordingProvider();
    setProviderForTests(provider);

    await resizeServer(serverId, user.id, BIGGER, new Date(), { charge: approve() });

    expect(calls).toEqual([BIGGER]);
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server).toMatchObject(BIGGER);
  });

  it("asks the provider before taking the money", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");
    const order: string[] = [];

    const base = new MockProvider();
    const provider = Object.assign(Object.create(Object.getPrototypeOf(base)), base, {
      async resize() {
        order.push("resize");
      },
    }) as ServerProvider;
    setProviderForTests(provider);

    const charge = vi.fn<ChargeFn>(async (request) => {
      order.push("charge");
      return { status: "succeeded", reference: request.idempotencyKey };
    });

    await resizeServer(serverId, user.id, BIGGER, new Date(), { charge });

    // The likely failure is the node having no room; the customer should not
    // pay to find that out.
    expect(order).toEqual(["resize", "charge"]);
  });

  it("charges nothing when the panel has no room", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");
    const { provider } = recordingProvider({ failOn: (spec) => spec.ramGb === BIGGER.ramGb });
    setProviderForTests(provider);
    const charge = approve();

    await expect(
      resizeServer(serverId, user.id, BIGGER, new Date(), { charge }),
    ).rejects.toMatchObject({ code: "no_capacity" });

    expect(charge).not.toHaveBeenCalled();
    // The server keeps what it had, and the order is not left hanging.
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server).toMatchObject({ ramGb: 8, vcpu: 4, storageGb: 50 });
    const failed = await prisma.order.findFirst({ where: { serverId, kind: "RESIZE" } });
    expect(failed?.status).toBe("FAILED");
  });

  it("puts the resources back when the card is declined", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");
    const { provider, calls } = recordingProvider();
    setProviderForTests(provider);

    await expect(
      resizeServer(serverId, user.id, BIGGER, new Date(), { charge: decline() }),
    ).rejects.toMatchObject({ code: "payment_failed" });

    // Applied, then rolled back to exactly what it was.
    expect(calls).toEqual([BIGGER, { ramGb: 8, vcpu: 4, storageGb: 50 }]);
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server).toMatchObject({ ramGb: 8, vcpu: 4, storageGb: 50 });
  });

  it("records a rollback the panel refused, rather than losing it", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");
    // Grows fine, refuses to shrink back.
    const { provider } = recordingProvider({ failOn: (spec) => spec.ramGb === 8 });
    setProviderForTests(provider);

    await expect(
      resizeServer(serverId, user.id, BIGGER, new Date(), { charge: decline() }),
    ).rejects.toMatchObject({ code: "payment_failed" });

    // The customer hears about the declined card; the admin sees why the
    // server is now larger than it is billed for.
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server.lastError).toContain("rollback");
  });

  it("applies a downgrade too, where nothing is charged", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");
    const { provider, calls } = recordingProvider();
    setProviderForTests(provider);
    const charge = approve();

    await resizeServer(serverId, user.id, SMALLER, new Date(), { charge });

    expect(calls).toEqual([SMALLER]);
    expect(charge).not.toHaveBeenCalled();
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server).toMatchObject(SMALLER);
  });
});
