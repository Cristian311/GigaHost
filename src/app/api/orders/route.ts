import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { listOrdersForUser } from "@/server/services/order-service";

export async function GET() {
  return withApi(async () => {
    const user = await getApiUser();
    const orders = await listOrdersForUser(user.id);
    return NextResponse.json(orders);
  });
}
