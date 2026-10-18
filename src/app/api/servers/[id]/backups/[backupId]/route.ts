import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { RATE_LIMITS, assertRateLimit } from "@/server/security/rate-limit";
import { deleteBackup } from "@/server/services/backup-service";

type Context = { params: Promise<{ id: string; backupId: string }> };

export async function DELETE(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    await assertRateLimit(`backups:${user.id}`, RATE_LIMITS.backups);
    const { id, backupId } = await params;
    await deleteBackup(id, user.id, backupId);
    return new NextResponse(null, { status: 204 });
  });
}
