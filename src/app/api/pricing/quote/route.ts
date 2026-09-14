import { NextResponse } from "next/server";
import { parseJson, withApi } from "@/server/api";
import { serverConfigSchema } from "@/lib/validation/server";
import { quote } from "@/server/services/pricing-service";

export async function POST(request: Request) {
  return withApi(async () => {
    const input = await parseJson(request, serverConfigSchema);
    const result = await quote(input);
    return NextResponse.json({
      breakdown: result.breakdown,
      game: { slug: result.game.slug, name: result.game.name },
      region: { code: result.region.code, name: result.region.name },
    });
  });
}
