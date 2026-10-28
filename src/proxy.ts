import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { homeFor, isVendorPath } from "@/lib/rbac";
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  createNonce,
} from "@/lib/security/headers";
import { safeCallbackUrl } from "@/lib/security/redirect";

// Lightweight Auth.js instance: verifies the JWT cookie only, never touches the DB.
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set(["/login"]);


export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const session = request.auth;
  const role = session?.user?.role;
  const isLoggedIn = Boolean(session?.user?.id) && (session?.absExp ?? 0) > Date.now() / 1000;
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", request.nextUrl);
    const target = safeCallbackUrl(pathname + search);
    if (pathname !== "/" && target !== "/dashboard") loginUrl.searchParams.set("callbackUrl", target);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (isLoggedIn && isPublic) {
    return applySecurityHeaders(NextResponse.redirect(new URL(homeFor(role), request.nextUrl)));
  }

  // Role-aware routing (the data-access layer re-checks on every page/action).
  if (isLoggedIn && role === "vendor" && !isVendorPath(pathname)) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/vendor", request.nextUrl)));
  }
  if (isLoggedIn && role !== "vendor" && (pathname === "/vendor" || pathname.startsWith("/vendor/"))) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.nextUrl)));
  }

  // Fresh nonce per request; Next.js reads it from the request CSP header and
  // applies it to its own scripts, so we set it on both request and response.
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return applySecurityHeaders(response, csp);
});

export const config = {
  matcher: [
    {
      // Everything except Auth.js endpoints, the session-expiry route, the cron job route
      // (header-authenticated), the public storefront API (API-key authenticated), Next
      // internals and static assets.
      source: "/((?!api/auth|api/session|api/jobs|api/public|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
