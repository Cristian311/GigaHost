import { NextResponse } from "next/server";
import { taskSchema } from "@/lib/validation/panel";
import { parseJson, withApi } from "@/server/api";
import { getApiUser } from "@/server/auth-guard";
import { deleteTask, updateTask } from "@/server/services/task-service";

type Context = { params: Promise<{ id: string; taskId: string }> };

export async function PUT(request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id, taskId } = await params;
    const input = await parseJson(request, taskSchema);
    return NextResponse.json(await updateTask(id, user.id, taskId, input));
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return withApi(async () => {
    const user = await getApiUser();
    const { id, taskId } = await params;
    await deleteTask(id, user.id, taskId);
    return new NextResponse(null, { status: 204 });
  });
}
