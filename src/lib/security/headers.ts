// Imported by the proxy: keep this module free of database or Node-only deps.
const isProduction = process.env.NODE_ENV === "production";

const BLOB_HOSTS = "https://*.public.blob.vercel-storage.com https://blob.vercel-storage.com https://*.vercel-storage.com";

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * Strict script policy (nonce + strict-dynamic). Inline styles are allowed on
 * purpose: shadcn's Base UI primitives position popups with inline style
 * attributes, which a nonce cannot cover. XSS protection comes from script-src.
 * Blob hosts are allowed for product images and direct browser uploads.
 */
export function buildContentSecurityPolicy(nonce: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProduction ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${BLOB_HOSTS}`,
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' ${BLOB_HOSTS}${isProduction ? "" : " ws: wss:"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "frame-src 'self'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  ...(isProduction
    ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }
    : {}),
};

export function applySecurityHeaders<T extends Response>(response: T, csp?: string): T {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  if (csp) response.headers.set("Content-Security-Policy", csp);
  return response;
}
