import { NextResponse } from "next/server";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { serverCommandSchema } from "@/lib/validation/server";
import { sendServerCommand } from "@/server/services/server-service";

type Context = { params: Promise<{ id: string }> };

/** Fallback for sending a console command when the websocket is not connected. */
export async function POST(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    const { command } = await parseJson(request, serverCommandSchema);
    await sendServerCommand(id, user.id, command);
    return new NextResponse(null, { status: 204 });
  });
}
