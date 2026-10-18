import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { getServerConsole, getServerForUser } from "@/server/services/server-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 80)));
    const [server, lines] = await Promise.all([
      getServerForUser(id, user.id),
      getServerConsole(id, user.id, limit),
    ]);
    return NextResponse.json({ status: server.status, lines });
  });
}
