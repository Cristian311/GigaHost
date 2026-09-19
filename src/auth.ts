import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validation/auth";
import {
  RATE_LIMITS,
  clearRateLimit,
  clientIp,
  consumeRateLimit,
} from "@/server/security/rate-limit";
import { authConfig } from "./auth.config";

export const oauthProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  discord: Boolean(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET),
};

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email & password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      // Counted per address *and* account, so one attacker cannot lock a
      // customer out from everywhere, and one address cannot try every account.
      const key = `login:${clientIp(request.headers)}:${parsed.data.email}`;
      const attempt = await consumeRateLimit(key, RATE_LIMITS.login);
      if (!attempt.allowed) return null;

      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
      });
      if (!user?.passwordHash) return null;

      const valid = await compare(parsed.data.password, user.passwordHash);
      if (!valid) return null;

      await clearRateLimit(key);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        locale: user.locale,
        sessionVersion: user.sessionVersion,
      };
    },
  }),
];

if (oauthProviders.google) providers.push(Google);
if (oauthProviders.discord) providers.push(Discord);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * JWT sessions cannot be revoked one by one, so each carries the account's
     * `sessionVersion` and is re-checked here, on the server, on every use.
     * Changing or resetting the password bumps the version, which ends every
     * session issued before it. The role is refreshed at the same time, so a
     * demoted admin loses access immediately rather than at the next login.
     * The proxy keeps using the database-free config; it only decides
     * redirects, never what data is served.
     */
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (!token?.id) return token;

      const current = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: { sessionVersion: true, role: true },
      });
      if (!current) return null;
      if ((token.sessionVersion ?? 0) !== current.sessionVersion) return null;

      token.role = current.role;
      return token;
    },
  },
});
