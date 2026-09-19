import { NextResponse } from "next/server";
import { messagesQuerySchema, ticketMessageSchema } from "@/lib/validation/ticket";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { addMessage, isStaffOnline, listMessages } from "@/server/services/ticket-service";

type Context = { params: Promise<{ id: string }> };

/** Polled by the thread: messages at or after `after`, plus ticket status and staff presence. */
export async function GET(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    const { after } = messagesQuerySchema.parse({
      after: new URL(request.url).searchParams.get("after") ?? undefined,
    });
    const [thread, staffOnline] = await Promise.all([
      listMessages(id, user, after ? new Date(after) : undefined),
      isStaffOnline(),
    ]);
    return NextResponse.json({ ...thread, staffOnline });
  });
}

export async function POST(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id } = await params;
    const input = await parseJson(request, ticketMessageSchema);
    const message = await addMessage(id, user, input);
    return NextResponse.json({ message }, { status: 201 });
  });
}
