import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { getServerForUser, getServerUsage } from "@/server/services/server-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    const [server, usage] = await Promise.all([
      getServerForUser(id, user.id),
      getServerUsage(id, user.id),
    ]);
    return NextResponse.json({ status: server.status, usage });
  });
}
