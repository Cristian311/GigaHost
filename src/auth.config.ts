import type { NextAuthConfig } from "next-auth";

/**
 * Edge/proxy-safe part of the Auth.js configuration: no database access here.
 * The full configuration (adapter + providers) lives in `src/auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/en/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "USER";
        token.locale = user.locale ?? "en";
      }
      if (trigger === "update" && session) {
        if (typeof session.name === "string") token.name = session.name;
        if (typeof session.locale === "string") token.locale = session.locale;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
        session.user.locale = (token.locale as string) ?? "en";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
