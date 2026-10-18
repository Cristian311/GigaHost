import { NextResponse } from "next/server";
import { commandSchema } from "@/lib/validation/panel";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { RATE_LIMITS, assertRateLimit } from "@/server/security/rate-limit";
import { sendCommand } from "@/server/services/console-service";

type Context = { params: Promise<{ id: string }> };

/** Fallback for sending a console command when the websocket is not connected. */
export async function POST(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    await assertRateLimit(`consoleCommand:${user.id}`, RATE_LIMITS.consoleCommand);
    const { command } = await parseJson(request, commandSchema);
    return NextResponse.json(await sendCommand(id, user.id, command));
  });
}
