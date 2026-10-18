import { NextResponse } from "next/server";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { createServerSchema } from "@/lib/validation/server";
import { APP_URL } from "@/lib/constants";
import { RATE_LIMITS, assertRateLimit } from "@/server/security/rate-limit";
import { assertEmailVerified } from "@/server/services/account-security-service";
import { checkout } from "@/server/services/order-service";
import { listServersForUser } from "@/server/services/server-service";

export async function GET(request: Request) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const servers = await listServersForUser(user.id);
    return NextResponse.json(servers);
  });
}

export async function POST(request: Request) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const input = await parseJson(request, createServerSchema);
    await assertEmailVerified(user.id);
    await assertRateLimit(`checkout:${user.id}`, RATE_LIMITS.checkout);
    const result = await checkout(user.id, input, {
      successUrl: `${APP_URL}/${user.locale}/dashboard/checkout/success`,
      cancelUrl: `${APP_URL}/${user.locale}/configure`,
    });
    // 201 when the server exists already, 202 when payment is still to be made.
    return NextResponse.json(result, { status: "serverId" in result ? 201 : 202 });
  });
}
