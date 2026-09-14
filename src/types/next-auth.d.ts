import type { DefaultSession } from "next-auth";

export type AppRole = "USER" | "ADMIN";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      locale: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: AppRole;
    locale?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AppRole;
    locale?: string;
  }
}
