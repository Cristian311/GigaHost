import { describe, expect, it } from "vitest";
import en from "./en.json";
import ro from "./ro.json";

/** Flattens a messages object into dotted key paths (array items by index). */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("messages", () => {
  it("ro.json defines exactly the same keys as en.json", () => {
    const enKeys = new Set(keyPaths(en));
    const roKeys = new Set(keyPaths(ro));
    expect([...enKeys].filter((key) => !roKeys.has(key))).toEqual([]);
    expect([...roKeys].filter((key) => !enKeys.has(key))).toEqual([]);
  });
});
