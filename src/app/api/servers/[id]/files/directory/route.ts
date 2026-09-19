import { NextResponse } from "next/server";
import { createDirectorySchema } from "@/lib/validation/panel";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { createDirectory } from "@/server/services/file-service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    const { path } = await parseJson(request, createDirectorySchema);
    return NextResponse.json(await createDirectory(id, user.id, path), { status: 201 });
  });
}
