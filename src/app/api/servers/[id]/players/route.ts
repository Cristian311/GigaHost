import { NextResponse } from "next/server";
import { moderatePlayerSchema } from "@/lib/validation/panel";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { getPlayers, moderatePlayer } from "@/server/services/console-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    return NextResponse.json(await getPlayers(id, user.id));
  });
}

/** { action: "kick" | "ban" | "op" | "deop", player } */
export async function POST(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    const { action, player } = await parseJson(request, moderatePlayerSchema);
    await moderatePlayer(id, user.id, action, player);
    return NextResponse.json(await getPlayers(id, user.id));
  });
}
