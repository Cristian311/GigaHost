import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiAdmin, getApiUser } from "@/server/auth-guard";
import { isStaffOnline, touchPresence } from "@/server/services/ticket-service";

/** Whether any admin is currently on the support pages. */
export async function GET() {
  return withApi(async () => {
    await getApiUser();
    return NextResponse.json({ staffOnline: await isStaffOnline() });
  });
}

/** Admin heartbeat, sent every 30 s while a support page is visible. */
export async function POST() {
  return withApi(async () => {
    const admin = await getApiAdmin();
    await touchPresence(admin.id);
    return NextResponse.json({ ok: true });
  });
}
