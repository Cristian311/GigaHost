import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { installAddon, uninstallAddon } from "@/server/services/addon-service";

type Context = { params: Promise<{ id: string; addonId: string }> };

export async function POST(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id, addonId } = await params;
    return NextResponse.json(await installAddon(id, user.id, addonId), { status: 201 });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id, addonId } = await params;
    return NextResponse.json(await uninstallAddon(id, user.id, addonId));
  });
}
