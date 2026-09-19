import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { restoreBackup } from "@/server/services/backup-service";

type Context = { params: Promise<{ id: string; backupId: string }> };

export async function POST(_request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id, backupId } = await params;
    const backup = await restoreBackup(id, user.id, backupId);
    return NextResponse.json({ id: backup.id, status: backup.status });
  });
}
