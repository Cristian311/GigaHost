import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// A cached health check reports the state of the past, which is worse than none.
export const dynamic = "force-dynamic";

/**
 * Readiness for uptime monitors and load balancers: 200 only when this instance
 * can actually reach its database, which is the failure that takes the whole
 * app down while the process keeps answering. Deliberately unauthenticated and
 * deliberately vague — it says whether the app is up, never why it is not.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("[health] database unreachable", error);
    return NextResponse.json({ status: "error", database: "down" }, { status: 503 });
  }

  return NextResponse.json({
    status: "ok",
    database: "up",
    latencyMs: Date.now() - startedAt,
  });
}
