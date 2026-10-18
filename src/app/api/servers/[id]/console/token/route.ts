import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { getServerConsoleAccess } from "@/server/services/server-service";

type Context = { params: Promise<{ id: string }> };

/** Short-lived websocket credentials for the live console; `access: null` means poll instead. */
export async function GET(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    const access = await getServerConsoleAccess(id, user.id);
    return NextResponse.json({ access }, { headers: { "Cache-Control": "no-store" } });
  });
}
