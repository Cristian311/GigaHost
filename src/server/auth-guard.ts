import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** For Server Components / Server Actions: redirects to the login page. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    const locale = await getLocale();
    redirect({ href: "/login", locale });
  }
  return session!.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    const locale = await getLocale();
    redirect({ href: "/dashboard", locale });
  }
  return user;
}

/** For Route Handlers: throws instead of redirecting. */
export async function getApiUser() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user;
}

export async function getApiAdmin() {
  const user = await getApiUser();
  if (user.role !== "ADMIN") throw new ForbiddenError();
  return user;
}
