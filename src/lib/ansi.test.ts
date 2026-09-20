import { describe, expect, it } from "vitest";
import { classifyLine, stripAnsi } from "./ansi";

describe("stripAnsi", () => {
  it("removes colour codes from Paper log lines", () => {
    const raw = "[36m[12:00:01 INFO]: [0mDone (4.123s)! For help, type \"help\"[m";
    expect(stripAnsi(raw)).toBe('[12:00:01 INFO]: Done (4.123s)! For help, type "help"');
  });

  it("removes window-title sequences and leaves plain text alone", () => {
    expect(stripAnsi("]0;Minecraftready")).toBe("ready");
    expect(stripAnsi("plain text")).toBe("plain text");
  });
});

describe("classifyLine", () => {
  it("detects warnings and errors", () => {
    expect(classifyLine("[12:00:01 WARN]: Can't keep up!")).toBe("warn");
    expect(classifyLine("[12:00:01 ERROR]: Could not load plugin")).toBe("error");
    expect(classifyLine("[Server thread/SEVERE]: crash")).toBe("error");
    expect(classifyLine("[12:00:01 INFO]: Steve joined the game")).toBe("info");
  });
});
