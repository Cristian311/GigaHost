import { describe, expect, it } from "vitest";
import {
  InvalidPathError,
  ancestorsOf,
  baseName,
  joinPath,
  normalizePath,
  parentOf,
} from "./path";

describe("normalizePath", () => {
  it("returns canonical relative paths", () => {
    expect(normalizePath("server.properties")).toBe("server.properties");
    expect(normalizePath("plugins/Essentials/config.yml")).toBe("plugins/Essentials/config.yml");
  });

  it("treats the empty path and bare slashes as the root", () => {
    expect(normalizePath("")).toBe("");
    expect(normalizePath("/")).toBe("");
    expect(normalizePath("///")).toBe("");
  });

  it("drops leading, trailing and repeated slashes", () => {
    expect(normalizePath("/plugins/")).toBe("plugins");
    expect(normalizePath("plugins//Essentials///config.yml")).toBe("plugins/Essentials/config.yml");
  });

  it.each([
    "..",
    "../etc/passwd",
    "plugins/../../etc/passwd",
    "plugins/..",
    "./server.properties",
    "plugins/./config.yml",
  ])("refuses to climb out of the root: %s", (path) => {
    expect(() => normalizePath(path)).toThrow(InvalidPathError);
  });

  it.each([
    "..\\..\\windows\\system32",
    "plugins\\config.yml",
    "C:\\Windows\\win.ini",
    "C:/Windows/win.ini",
  ])("refuses Windows-style paths: %s", (path) => {
    expect(() => normalizePath(path)).toThrow(InvalidPathError);
  });

  it("refuses control characters, including a null byte", () => {
    expect(() => normalizePath("server.properties\u0000.jpg")).toThrow(InvalidPathError);
    expect(() => normalizePath("logs/\nlatest.log")).toThrow(InvalidPathError);
  });

  it.each(['a<b', "a>b", 'a"b', "a|b", "a?b", "a*b"])(
    "refuses characters that are not portable: %s",
    (path) => {
      expect(() => normalizePath(path)).toThrow(InvalidPathError);
    },
  );

  it("refuses names with leading or trailing spaces", () => {
    expect(() => normalizePath(" server.properties")).toThrow(InvalidPathError);
    expect(() => normalizePath("plugins/config.yml ")).toThrow(InvalidPathError);
  });

  it("allows spaces and dots inside names", () => {
    expect(normalizePath("world backups/my world.v2.zip")).toBe("world backups/my world.v2.zip");
    expect(normalizePath(".hidden")).toBe(".hidden");
    expect(normalizePath("..hidden")).toBe("..hidden");
  });

  it("refuses over-long names and paths", () => {
    expect(() => normalizePath("a".repeat(101))).toThrow(InvalidPathError);
    expect(() => normalizePath(Array(10).fill("a".repeat(30)).join("/"))).toThrow(InvalidPathError);
    expect(normalizePath("a".repeat(100))).toHaveLength(100);
  });

  it("refuses anything that is not a string", () => {
    for (const value of [null, undefined, 42, {}, ["a"]]) {
      expect(() => normalizePath(value)).toThrow(InvalidPathError);
    }
  });
});

describe("path helpers", () => {
  it("find the parent directory", () => {
    expect(parentOf("plugins/Essentials/config.yml")).toBe("plugins/Essentials");
    expect(parentOf("server.properties")).toBe("");
    expect(parentOf("")).toBe("");
  });

  it("find the file name", () => {
    expect(baseName("plugins/Essentials/config.yml")).toBe("config.yml");
    expect(baseName("server.properties")).toBe("server.properties");
  });

  it("join a directory and a name", () => {
    expect(joinPath("", "eula.txt")).toBe("eula.txt");
    expect(joinPath("plugins", "Vault.jar")).toBe("plugins/Vault.jar");
  });

  it("list every directory above a path", () => {
    expect(ancestorsOf("a/b/c.txt")).toEqual(["a", "a/b"]);
    expect(ancestorsOf("c.txt")).toEqual([]);
  });
});
