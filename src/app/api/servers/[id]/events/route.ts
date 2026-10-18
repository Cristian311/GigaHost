import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { getServerEvents } from "@/server/services/server-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    const limit = Math.min(
      200,
      Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 50)),
    );
    return NextResponse.json(await getServerEvents(id, user.id, limit));
  });
}
