import { describe, expect, it } from "vitest";
import { canCustomerReply, nextStatusAfterMessage } from "./ticket-status";

describe("nextStatusAfterMessage", () => {
  it("puts the ticket back in the staff queue when the customer writes", () => {
    expect(nextStatusAfterMessage("OPEN", false)).toBe("OPEN");
    expect(nextStatusAfterMessage("PENDING", false)).toBe("OPEN");
    expect(nextStatusAfterMessage("RESOLVED", false)).toBe("OPEN");
  });

  it("waits on the customer after a staff reply", () => {
    expect(nextStatusAfterMessage("OPEN", true)).toBe("PENDING");
    expect(nextStatusAfterMessage("PENDING", true)).toBe("PENDING");
    expect(nextStatusAfterMessage("RESOLVED", true)).toBe("PENDING");
  });

  it("keeps closed tickets closed", () => {
    expect(nextStatusAfterMessage("CLOSED", false)).toBe("CLOSED");
    expect(nextStatusAfterMessage("CLOSED", true)).toBe("CLOSED");
  });
});

describe("canCustomerReply", () => {
  it("allows replies on every status except CLOSED", () => {
    expect(canCustomerReply("OPEN")).toBe(true);
    expect(canCustomerReply("PENDING")).toBe(true);
    expect(canCustomerReply("RESOLVED")).toBe(true);
    expect(canCustomerReply("CLOSED")).toBe(false);
  });
});
