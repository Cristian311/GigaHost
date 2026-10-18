import { NextResponse } from "next/server";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { RATE_LIMITS, assertRateLimit } from "@/server/security/rate-limit";
import { powerActionSchema } from "@/lib/validation/server";
import { powerServer } from "@/server/services/server-service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    await assertRateLimit(`serverPower:${user.id}`, RATE_LIMITS.serverPower);
    const { id } = await params;
    const { action } = await parseJson(request, powerActionSchema);
    const server = await powerServer(id, user.id, action);
    return NextResponse.json({ id: server.id, status: server.status });
  });
}
