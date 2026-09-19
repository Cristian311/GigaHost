import { describe, expect, it } from "vitest";
import type { Game, Region } from "@/generated/prisma/client";
import { parseEggVariables, toPterodactylTarget } from "./targets";

describe("parseEggVariables", () => {
  it("accepts flat objects and stringifies values", () => {
    expect(parseEggVariables('{"SERVER_JARFILE":"server.jar","BUILD":5,"EULA":true}')).toEqual({
      SERVER_JARFILE: "server.jar",
      BUILD: "5",
      EULA: "true",
    });
  });

  it("falls back to {} for anything else", () => {
    expect(parseEggVariables("")).toEqual({});
    expect(parseEggVariables("not json")).toEqual({});
    expect(parseEggVariables("[1,2]")).toEqual({});
    expect(parseEggVariables(null)).toEqual({});
  });
});

describe("toPterodactylTarget", () => {
  const game = {
    pterodactylNestId: 1,
    pterodactylEggId: 3,
    dockerImage: null,
    versionVariable: "MINECRAFT_VERSION",
    eggVariables: '{"SERVER_JARFILE":"server.jar"}',
  } as Game;
  const region = { pterodactylLocationId: 2 } as Region;

  it("combines game and region settings", () => {
    expect(toPterodactylTarget(game, region)).toEqual({
      nestId: 1,
      eggId: 3,
      locationId: 2,
      dockerImage: null,
      versionVariable: "MINECRAFT_VERSION",
      variables: { SERVER_JARFILE: "server.jar" },
    });
  });

  it("returns null when either side is not configured", () => {
    expect(toPterodactylTarget({ ...game, pterodactylEggId: null }, region)).toBeNull();
    expect(toPterodactylTarget(game, { pterodactylLocationId: null } as Region)).toBeNull();
  });
});
