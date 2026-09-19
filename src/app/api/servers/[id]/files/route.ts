import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { deletePath, listFiles } from "@/server/services/file-service";

type Context = { params: Promise<{ id: string }> };

/** GET ?path=plugins -> entries of that folder (the root when omitted). */
export async function GET(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    const path = new URL(request.url).searchParams.get("path") ?? "";
    return NextResponse.json(await listFiles(id, user.id, path));
  });
}

/** DELETE ?path=plugins/Old.jar -> removes a file, or a folder with everything in it. */
export async function DELETE(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    const path = new URL(request.url).searchParams.get("path") ?? "";
    await deletePath(id, user.id, path);
    return new NextResponse(null, { status: 204 });
  });
}
