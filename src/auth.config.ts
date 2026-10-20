import type { NextAuthConfig } from "next-auth";
import { SESSION_ABSOLUTE_SECONDS } from "@/lib/auth/constants";
import { isTokenWithinAbsoluteLifetime } from "@/lib/auth/token";

// Shared, dependency-free Auth.js configuration. The proxy instantiates NextAuth
// with exactly this object, so it must never import the database or argon2.
// The real Credentials provider is added in src/auth.ts.

const isProduction = process.env.NODE_ENV === "production";
// __Host- cookies require https, Path=/ and no Domain: exactly what production gets.
const cookiePrefix = isProduction ? "__Host-" : "";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isProduction };

export const authConfig = {
  trustHost: true,
  providers: [],
  session: { strategy: "jwt", maxAge: SESSION_ABSOLUTE_SECONDS },
  pages: { signIn: "/login", error: "/login" },
  cookies: {
    sessionToken: { name: `${cookiePrefix}authjs.session-token`, options: cookieOptions },
    csrfToken: { name: `${cookiePrefix}authjs.csrf-token`, options: cookieOptions },
    callbackUrl: { name: `${cookiePrefix}authjs.callback-url`, options: cookieOptions },
  },
  callbacks: {
    // Returning null makes Auth.js clear the session cookie.
    jwt({ token }) {
      return isTokenWithinAbsoluteLifetime(token) ? token : null;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.name = token.name ?? "";
      session.user.email = token.email ?? "";
      session.user.role = token.role ?? "admin";
      session.sid = token.sid ?? "";
      session.sv = token.sv ?? 0;
      session.absExp = token.absExp ?? 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
