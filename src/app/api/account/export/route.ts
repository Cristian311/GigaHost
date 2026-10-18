import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { exportAccountData } from "@/server/services/account-data-service";

export const dynamic = "force-dynamic";

/**
 * GDPR article 15 and 20: the customer downloads everything held about them,
 * without having to write to anyone. Scoped to the caller's own account, so
 * there is nothing to pass and nothing to get wrong.
 */
export async function GET(request: Request) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const data = await exportAccountData(user.id);

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="gigahost-data-${stamp}.json"`,
        // Personal data: never store it in a shared cache.
        "cache-control": "no-store, private",
      },
    });
  });
}
