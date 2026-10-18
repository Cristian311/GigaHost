import { NextResponse } from "next/server";
import { writeFileSchema } from "@/lib/validation/panel";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { RATE_LIMITS, assertRateLimit } from "@/server/security/rate-limit";
import { readFile, writeFile } from "@/server/services/file-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    await assertRateLimit(`serverFiles:${user.id}`, RATE_LIMITS.serverFiles);
    const { id } = await params;
    const path = new URL(request.url).searchParams.get("path") ?? "";
    return NextResponse.json(await readFile(id, user.id, path));
  });
}

/** Creates the file when it does not exist yet. */
export async function PUT(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    await assertRateLimit(`serverFiles:${user.id}`, RATE_LIMITS.serverFiles);
    const { id } = await params;
    const { path, content } = await parseJson(request, writeFileSchema);
    return NextResponse.json(await writeFile(id, user.id, path, content));
  });
}
