import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { deleteBackup } from "@/server/services/backup-service";

type Context = { params: Promise<{ id: string; backupId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id, backupId } = await params;
    await deleteBackup(id, user.id, backupId);
    return new NextResponse(null, { status: 204 });
  });
}
