import { NextResponse } from "next/server";
import { parseJson, withApi } from "@/server/api";
import { serverConfigSchema } from "@/lib/validation/server";
import { RATE_LIMITS, assertRateLimit, clientIp } from "@/server/security/rate-limit";
import { quote } from "@/server/services/pricing-service";

export async function POST(request: Request) {
  return withApi(request, async () => {
    // Public and unauthenticated, so keyed on the address. Generous, because
    // the configurator asks again on every slider move.
    await assertRateLimit(`quote:${clientIp(request.headers)}`, RATE_LIMITS.quote);
    const input = await parseJson(request, serverConfigSchema);
    const result = await quote(input);
    return NextResponse.json({
      breakdown: result.breakdown,
      game: { slug: result.game.slug, name: result.game.name },
      region: { code: result.region.code, name: result.region.name },
    });
  });
}
