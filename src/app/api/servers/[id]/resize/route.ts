import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { resizeServerSchema } from "@/lib/validation/server";
import { RATE_LIMITS, assertRateLimit } from "@/server/security/rate-limit";
import { previewResize, resizeServer } from "@/server/services/resize-service";

type Context = { params: Promise<{ id: string }> };

const bodySchema = resizeServerSchema.extend({ dryRun: z.boolean().optional() });

export async function POST(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    const { dryRun, ...config } = await parseJson(request, bodySchema);

    if (dryRun) {
      return NextResponse.json(await previewResize(id, user.id, config));
    }

    // Only the real resize is capped; the preview is what the slider calls.
    await assertRateLimit(`resize:${user.id}`, RATE_LIMITS.resize);
    const result = await resizeServer(id, user.id, config);
    return NextResponse.json({
      serverId: result.server.id,
      orderId: result.orderId,
      chargeCents: result.preview.proration.chargeCents,
      creditCents: result.preview.proration.creditCents,
    });
  });
}
