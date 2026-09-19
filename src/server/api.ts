import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/server/errors";
import { ForbiddenError, UnauthorizedError } from "@/server/auth-guard";

export function jsonError(status: number, code: string, details?: unknown) {
  return NextResponse.json({ error: code, details: details ?? null }, { status });
}

/** Wraps a route handler and converts known errors into JSON responses. */
export async function withApi(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(400, "validation", z.flattenError(error));
    }
    if (error instanceof UnauthorizedError) return jsonError(401, "unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "forbidden");
    if (error instanceof AppError) {
      const response = jsonError(error.status, error.code, error.details ?? error.message);
      const retryAfter = (error.details as { retryAfterSeconds?: number } | undefined)
        ?.retryAfterSeconds;
      if (error.status === 429 && retryAfter) response.headers.set("Retry-After", String(retryAfter));
      return response;
    }
    console.error(error);
    return jsonError(500, "internal_error");
  }
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("validation", 400, "Body must be valid JSON.");
  }
  return schema.parse(body);
}
