/** Runs once when the Next.js server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionEnv, assertProviderConfig } = await import("./lib/env");
  // Fail at boot with a readable message instead of on the first order.
  assertProductionEnv();
  assertProviderConfig();
}
