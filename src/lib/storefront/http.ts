import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";

// Shared plumbing for /api/public/*: API key check, CORS and cache headers.

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const list = (env.STOREFRONT_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  return list.includes("*") ? "*" : list.includes(origin) ? origin : null;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  return origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "x-api-key, content-type", "Access-Control-Max-Age": "86400", Vary: "Origin" } : { Vary: "Origin" };
}

/** Null when the request may proceed; otherwise the error response to return. */
export function checkStorefrontAccess(request: Request): Response | null {
  const key = env.STOREFRONT_API_KEY;
  if (!key) {
    if (env.isProduction) return json(request, { error: "storefront_api_disabled", message: "Set STOREFRONT_API_KEY to enable the public API." }, { status: 503 });
    return null; // open in development
  }
  const given = Buffer.from(request.headers.get("x-api-key") ?? "");
  const expected = Buffer.from(key);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return json(request, { error: "unauthorized", message: "Missing or invalid x-api-key header." }, { status: 401 });
  return null;
}

export function json(request: Request, body: unknown, init: { status?: number; cache?: boolean } = {}): Response {
  const status = init.status ?? 200;
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": status === 200 && init.cache !== false ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
