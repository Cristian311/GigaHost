import { NextResponse } from "next/server";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { createServerSchema } from "@/lib/validation/server";
import { checkoutMock } from "@/server/services/order-service";
import { listServersForUser } from "@/server/services/server-service";

export async function GET() {
  return withApi(async () => {
    const user = await getApiUser();
    const servers = await listServersForUser(user.id);
    return NextResponse.json(servers);
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const user = await getApiUser();
    const input = await parseJson(request, createServerSchema);
    const result = await checkoutMock(user.id, input);
    return NextResponse.json(result, { status: 201 });
  });
}
