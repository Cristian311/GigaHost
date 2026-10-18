import { NextResponse } from "next/server";
import { taskSchema } from "@/lib/validation/panel";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { createTask, listTasks } from "@/server/services/task-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    return NextResponse.json(await listTasks(id, user.id));
  });
}

export async function POST(request: Request, { params }: Context) {
  return withApi(request, async () => {
    const user = await getApiUser();
    const { id } = await params;
    const input = await parseJson(request, taskSchema);
    return NextResponse.json(await createTask(id, user.id, input), { status: 201 });
  });
}
