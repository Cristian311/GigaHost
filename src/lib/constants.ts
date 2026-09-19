/** Hard limits for the configurator sliders (per-game minimums come from the DB). */
export const RESOURCE_LIMITS = {
  ram: { min: 1, max: 64, step: 1 },
  cpu: { min: 1, max: 16, step: 1 },
  storage: { min: 10, max: 500, step: 10 },
} as const;

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "GigaHost";

/** Mock provider timings (ms). Transitions are computed lazily on read. */
export const MOCK_TIMINGS = {
  installing: 10_000,
  starting: 5_000,
  stopping: 3_000,
  backup: 5_000,
} as const;

/** Backups kept per server before the oldest must be removed. */
export const MAX_BACKUPS_PER_SERVER = 5;
