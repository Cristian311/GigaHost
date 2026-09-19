import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { getCheckoutState } from "@/server/services/payment-service";

type Context = { params: Promise<{ id: string }> };

/** Polled by the checkout success page until the order has been fulfilled. */
export async function GET(_request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    return NextResponse.json(await getCheckoutState(id, user.id));
  });
}
