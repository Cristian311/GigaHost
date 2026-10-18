import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { deleteServer, getServerForUser } from "@/server/services/server-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    const server = await getServerForUser(id, user.id);
    return NextResponse.json(server);
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    await deleteServer(id, user.id);
    return new NextResponse(null, { status: 204 });
  });
}
