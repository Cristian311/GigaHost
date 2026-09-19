import { MOCK_TIMINGS } from "@/lib/constants";
import type {
  ConsoleAccess,
  ConsoleLine,
  ProviderStatus,
  ProvisionInput,
  ProvisionResult,
  ResourceUsage,
  ServerProvider,
  ServerRef,
} from "./types";

/** Small deterministic PRNG so the mock output is stable per server. */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGION_IP_PREFIX: Record<string, string> = {
  "eu-ro": "185.12",
  "eu-de": "116.203",
  "eu-uk": "178.62",
  "us-east": "159.65",
};

/**
 * Simulated provisioning backend.
 *
 * State transitions are computed lazily from `statusChangedAt` rather than
 * with timers, so they work in serverless environments and across restarts:
 *   INSTALLING --10s--> STOPPED
 *   STARTING   --5s---> RUNNING
 *   STOPPING   --3s---> STOPPED
 */
export class MockProvider implements ServerProvider {
  readonly name = "mock";

  async createServer(input: ProvisionInput): Promise<ProvisionResult> {
    const rand = mulberry32(hashString(input.serverId));
    const prefix = REGION_IP_PREFIX[input.regionCode] ?? "10.0";
    const ip = `${prefix}.${Math.floor(rand() * 200) + 10}.${Math.floor(rand() * 200) + 10}`;
    const port = 25000 + Math.floor(rand() * 5000);
    return { providerId: `mock_${input.serverId}`, identifier: null, internalId: null, ip, port };
  }

  async deleteServer(): Promise<void> {
    // Nothing to tear down in the simulation.
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async restart(): Promise<void> {}
  async suspend(): Promise<void> {}
  async unsuspend(): Promise<void> {}
  async sendCommand(): Promise<void> {}

  async getConsoleAccess(): Promise<ConsoleAccess | null> {
    return null;
  }

  async getStatus(ref: ServerRef): Promise<ProviderStatus> {
    const elapsed = Date.now() - ref.statusChangedAt.getTime();
    switch (ref.status) {
      case "INSTALLING":
        return elapsed >= MOCK_TIMINGS.installing ? "STOPPED" : "INSTALLING";
      case "STARTING":
        return elapsed >= MOCK_TIMINGS.starting ? "RUNNING" : "STARTING";
      case "STOPPING":
        return elapsed >= MOCK_TIMINGS.stopping ? "STOPPED" : "STOPPING";
      default:
        return ref.status;
    }
  }

  async getUsage(ref: ServerRef): Promise<ResourceUsage> {
    const running = ref.status === "RUNNING";
    const ramTotalMb = ref.ramGb * 1024;
    const diskTotalMb = ref.storageGb * 1024;
    const seed = hashString(ref.providerId);
    const now = Date.now();
    const uptimeSec = running
      ? Math.max(0, Math.floor((now - ref.statusChangedAt.getTime()) / 1000))
      : 0;

    // Disk usage grows slowly with uptime, deterministic per server.
    const baseDisk = 0.12 + (seed % 20) / 100;
    const diskUsedMb = Math.min(
      diskTotalMb,
      Math.floor(diskTotalMb * baseDisk + uptimeSec * 0.05),
    );

    const history: ResourceUsage["history"] = [];
    const points = 30;
    for (let i = points - 1; i >= 0; i--) {
      const t = now - i * 10_000;
      const bucket = Math.floor(t / 10_000);
      const rand = mulberry32(seed ^ bucket);
      const cpuPct = running ? Math.round(18 + rand() * 40 + Math.sin(bucket / 4) * 8) : 0;
      const ramUsedMb = running
        ? Math.round(ramTotalMb * (0.35 + rand() * 0.25))
        : 0;
      history.push({ t, cpuPct: Math.max(0, Math.min(100, cpuPct)), ramUsedMb });
    }

    const last = history[history.length - 1];
    const players = running ? Math.floor(mulberry32(seed ^ Math.floor(now / 60_000))() * 12) : 0;

    return {
      cpuPct: last.cpuPct,
      ramUsedMb: last.ramUsedMb,
      ramTotalMb,
      diskUsedMb,
      diskTotalMb,
      players,
      uptimeSec,
      history,
    };
  }

  async getConsoleLines(ref: ServerRef, limit = 60): Promise<ConsoleLine[]> {
    const lines: ConsoleLine[] = [];
    const startedAt = ref.statusChangedAt.getTime();
    const push = (offsetMs: number, level: ConsoleLine["level"], text: string) =>
      lines.push({ ts: new Date(startedAt + offsetMs).toISOString(), level, text });

    if (ref.status === "INSTALLING") {
      push(0, "info", "Provisioning container on node…");
      push(1500, "info", "Pulling game image…");
      push(4000, "info", "Downloading server files (this may take a moment)…");
      push(7000, "info", "Writing default configuration…");
      return lines.slice(-limit);
    }

    if (ref.status === "STOPPED") {
      push(0, "info", "Server process exited with code 0.");
      push(10, "info", "Container is idle. Press Start to boot the server.");
      return lines.slice(-limit);
    }

    if (ref.status === "STOPPING") {
      push(0, "info", "Received stop signal, saving world…");
      push(800, "info", "Saving chunks for level 'world'…");
      return lines.slice(-limit);
    }

    push(0, "info", "Starting server process…");
    push(400, "info", `Allocated ${ref.ramGb}G heap (-Xmx${ref.ramGb}G).`);
    push(1200, "info", "Loading libraries, please wait…");
    push(2500, "info", "Preparing level 'world'…");
    push(4200, "info", "Preparing spawn area: 100%");
    push(4800, "info", "Done (4.7s)! For help, type \"help\"");

    if (ref.status === "RUNNING") {
      const seed = hashString(ref.providerId);
      const rand = mulberry32(seed);
      const names = ["Steve", "Alex", "Nova", "Pixel", "Kratos", "Luna", "Zed", "Mira"];
      const elapsed = Date.now() - startedAt;
      let t = 6000;
      let i = 0;
      while (t < elapsed && i < 200) {
        const name = names[Math.floor(rand() * names.length)];
        const roll = rand();
        if (roll < 0.35) push(t, "info", `${name} joined the game`);
        else if (roll < 0.55) push(t, "info", `<${name}> gg`);
        else if (roll < 0.7) push(t, "info", `${name} left the game`);
        else if (roll < 0.85) push(t, "info", "Saved the game");
        else if (roll < 0.95) push(t, "warn", "Can't keep up! Is the server overloaded? Running 2043ms behind.");
        else push(t, "info", "Automatic backup completed (12.4 MB)");
        t += 15_000 + Math.floor(rand() * 45_000);
        i++;
      }
    }

    return lines.slice(-limit);
  }
}
