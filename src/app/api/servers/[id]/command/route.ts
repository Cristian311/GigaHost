import { NextResponse } from "next/server";
import { commandSchema } from "@/lib/validation/panel";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { sendCommand } from "@/server/services/console-service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    const { command } = await parseJson(request, commandSchema);
    return NextResponse.json(await sendCommand(id, user.id, command));
  });
}
