import { describe, expect, it } from "vitest";
import type { PteroEgg, PteroServer } from "./client";
import {
  buildCreateServerBody,
  buildEnvironment,
  javaVersionFor,
  mapApplicationStatus,
  mapClientState,
  pickAddress,
  pickDockerImage,
  toResourceSample,
} from "./mapping";

// Shaped like GET /api/application/nests/1/eggs/3?include=variables on a stock panel.
const paperEgg: PteroEgg = {
  id: 3,
  name: "Paper",
  docker_image: "ghcr.io/pterodactyl/yolks:java_17",
  docker_images: {
    "Java 8": "ghcr.io/pterodactyl/yolks:java_8",
    "Java 11": "ghcr.io/pterodactyl/yolks:java_11",
    "Java 17": "ghcr.io/pterodactyl/yolks:java_17",
    "Java 21": "ghcr.io/pterodactyl/yolks:java_21",
  },
  startup: "java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}",
  relationships: {
    variables: {
      object: "list",
      data: [
        { object: "egg_variable", attributes: { name: "Minecraft Version", env_variable: "MINECRAFT_VERSION", default_value: "latest", rules: "nullable|string|max:20" } },
        { object: "egg_variable", attributes: { name: "Server Jar File", env_variable: "SERVER_JARFILE", default_value: "server.jar", rules: "required|regex:/^([\\w\\d._-]+)(\\.jar)$/" } },
        { object: "egg_variable", attributes: { name: "Build Number", env_variable: "BUILD_NUMBER", default_value: "latest", rules: "required|string|max:20" } },
      ],
    },
  },
};

describe("mapClientState", () => {
  it("maps Wings power states", () => {
    expect(mapClientState("running", false)).toBe("RUNNING");
    expect(mapClientState("starting", false)).toBe("STARTING");
    expect(mapClientState("stopping", false)).toBe("STOPPING");
    expect(mapClientState("offline", false)).toBe("STOPPED");
    expect(mapClientState("weird", false)).toBe("ERROR");
  });

  it("reports suspension before the power state", () => {
    expect(mapClientState("offline", true)).toBe("SUSPENDED");
  });
});

describe("mapApplicationStatus", () => {
  it("maps install and suspension states", () => {
    expect(mapApplicationStatus({ status: "installing" })).toBe("INSTALLING");
    expect(mapApplicationStatus({ status: "install_failed" })).toBe("ERROR");
    expect(mapApplicationStatus({ status: "suspended" })).toBe("SUSPENDED");
    expect(mapApplicationStatus({ status: null, suspended: true })).toBe("SUSPENDED");
    expect(mapApplicationStatus({ status: null, container: { installed: 0 } })).toBe("INSTALLING");
  });

  it("returns null when the client API should decide", () => {
    expect(mapApplicationStatus({ status: null, container: { installed: 1 } })).toBeNull();
  });
});

describe("javaVersionFor / pickDockerImage", () => {
  it("knows which Java each Minecraft release needs", () => {
    expect(javaVersionFor("1.21.8")).toBe(21);
    expect(javaVersionFor("1.20.5")).toBe(21);
    expect(javaVersionFor("1.20.4")).toBe(17);
    expect(javaVersionFor("1.18.2")).toBe(17);
    expect(javaVersionFor("1.17.1")).toBe(16);
    expect(javaVersionFor("1.12.2")).toBe(8);
    expect(javaVersionFor("latest")).toBeNull();
    expect(javaVersionFor("26.1")).toBeNull();
  });

  it("picks the matching image, the closest newer one, or the newest", () => {
    expect(pickDockerImage(paperEgg, null, "1.21.8")).toBe("ghcr.io/pterodactyl/yolks:java_21");
    expect(pickDockerImage(paperEgg, null, "1.12.2")).toBe("ghcr.io/pterodactyl/yolks:java_8");
    // Java 16 is not offered: use 17.
    expect(pickDockerImage(paperEgg, null, "1.17.1")).toBe("ghcr.io/pterodactyl/yolks:java_17");
    expect(pickDockerImage(paperEgg, null, "latest")).toBe("ghcr.io/pterodactyl/yolks:java_21");
  });

  it("honours an explicit override and eggs without an image list", () => {
    expect(pickDockerImage(paperEgg, "custom:image", "1.12.2")).toBe("custom:image");
    expect(pickDockerImage({ docker_image: "only:one" }, null, "1.21.8")).toBe("only:one");
  });
});

describe("buildEnvironment", () => {
  it("layers egg defaults, fixed variables and the version", () => {
    const env = buildEnvironment(
      [
        { env_variable: "MINECRAFT_VERSION", default_value: "latest" },
        { env_variable: "SERVER_JARFILE", default_value: "server.jar" },
        { env_variable: "EMPTY", default_value: null },
      ],
      { SERVER_JARFILE: "paper.jar" },
      "MINECRAFT_VERSION",
      "1.21.8",
    );
    expect(env).toEqual({ MINECRAFT_VERSION: "1.21.8", SERVER_JARFILE: "paper.jar", EMPTY: "" });
  });

  it("normalises Latest to the lowercase keyword eggs expect", () => {
    const env = buildEnvironment([], {}, "VANILLA_VERSION", "Latest");
    expect(env).toEqual({ VANILLA_VERSION: "latest" });
  });
});

describe("buildCreateServerBody", () => {
  it("converts the GigaHost configuration into panel limits", () => {
    const body = buildCreateServerBody(
      { serverId: "srv_1", name: "Friday SMP", ramGb: 4, vcpu: 2, storageGb: 20, gameVersion: "1.21.8" },
      {
        nestId: 1,
        eggId: 3,
        locationId: 7,
        dockerImage: null,
        versionVariable: "MINECRAFT_VERSION",
        variables: { SERVER_JARFILE: "server.jar" },
      },
      paperEgg,
      1,
    );
    expect(body).toMatchObject({
      name: "Friday SMP",
      external_id: "srv_1",
      user: 1,
      egg: 3,
      docker_image: "ghcr.io/pterodactyl/yolks:java_21",
      limits: { memory: 4096, swap: 0, disk: 20480, io: 500, cpu: 200 },
      deploy: { locations: [7], dedicated_ip: false, port_range: [] },
      start_on_completion: false,
    });
    expect(body.environment).toEqual({
      MINECRAFT_VERSION: "1.21.8",
      SERVER_JARFILE: "server.jar",
      BUILD_NUMBER: "latest",
    });
  });
});

describe("pickAddress", () => {
  const server = (alias: string | null): PteroServer => ({
    id: 12,
    uuid: "uuid",
    identifier: "abcd1234",
    name: "x",
    status: null,
    allocation: 5,
    relationships: {
      allocations: {
        object: "list",
        data: [
          { object: "allocation", attributes: { id: 4, ip: "0.0.0.0", alias: null, port: 25566, assigned: true } },
          { object: "allocation", attributes: { id: 5, ip: "0.0.0.0", alias, port: 25565, assigned: true } },
        ],
      },
    },
  });

  it("uses the primary allocation and prefers its alias", () => {
    expect(pickAddress(server("play.example.com"))).toEqual({ ip: "play.example.com", port: 25565 });
    expect(pickAddress(server(null))).toEqual({ ip: "0.0.0.0", port: 25565 });
  });
});

describe("toResourceSample", () => {
  it("expresses CPU relative to the server's vCPU limit", () => {
    const sample = toResourceSample(
      { cpu_absolute: 150, memory_bytes: 2 * 1024 ** 3, disk_bytes: 512 * 1024 ** 2, uptime: 90_500 },
      { vcpu: 2 },
    );
    expect(sample).toEqual({ cpuPct: 75, ramUsedMb: 2048, diskUsedMb: 512, uptimeSec: 90 });
  });
});
