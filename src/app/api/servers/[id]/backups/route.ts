import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { createBackup, listBackups } from "@/server/services/backup-service";

type Context = { params: Promise<{ id: string }> };

const createSchema = z.object({ name: z.string().trim().max(60).optional() });

export async function GET(_request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    return NextResponse.json(await listBackups(id, user.id));
  });
}

export async function POST(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    const { name } = await parseJson(request, createSchema);
    const backup = await createBackup(id, user.id, name);
    return NextResponse.json(backup, { status: 201 });
  });
}
