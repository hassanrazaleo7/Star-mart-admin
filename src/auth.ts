import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { authenticate } from "@/lib/auth/authenticate";
import { SESSION_ABSOLUTE_SECONDS } from "@/lib/auth/constants";
import { revokeSession } from "@/lib/auth/sessions-store";
import { isTokenWithinAbsoluteLifetime, nowSeconds } from "@/lib/auth/token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: (credentials, request) => authenticate(credentials, request),
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        // Sign-in: bind the token to the admin_sessions row created in authenticate().
        return {
          ...token,
          sub: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
          sid: user.sid,
          role: user.role,
          sv: user.sessionVersion,
          absExp: nowSeconds() + SESSION_ABSOLUTE_SECONDS,
        };
      }
      return isTokenWithinAbsoluteLifetime(token) ? token : null;
    },
  },
  logger: {
    // Expected credential failures are already in the audit log; keep stack traces for real errors.
    error(error) {
      if (error instanceof CredentialsSignin) return;
      console.error("[auth][error]", error);
    },
  },
  events: {
    // Safety net: whatever path leads to signOut, the session row is closed.
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (token?.sid) {
        await revokeSession(token.sid, "logout").catch((error) =>
          console.error("[auth] failed to revoke session on signOut", error),
        );
      }
    },
  },
} satisfies NextAuthConfig);
