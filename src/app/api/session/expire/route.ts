import { NextResponse } from "next/server";
import { signOut } from "@/auth";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Redirect-loop breaker. The proxy trusts the JWT; when the matching database
 * session has been revoked, pages send the browser here so the dead cookie can
 * be cleared (a page render cannot set cookies). It only ever clears cookies
 * whose database session is already dead, so it cannot be abused as a logout.
 */
export async function GET(request: Request) {
  const ctx = await getCurrentSession();
  if (ctx) return NextResponse.redirect(new URL("/dashboard", request.url));
  await signOut({ redirect: false });
  return NextResponse.redirect(new URL("/login?reason=expired", request.url));
}
