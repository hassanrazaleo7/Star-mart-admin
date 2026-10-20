const DEFAULT_TARGET = "/dashboard";

/**
 * Accepts only same-origin relative paths for post-login redirects. Rejects
 * protocol-relative URLs, backslash tricks, absolute URLs, the login page and
 * API routes. Returns `fallback` for anything suspicious.
 */
export function safeCallbackUrl(raw: unknown, fallback: string = DEFAULT_TARGET): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, "http://localhost");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://localhost") return fallback;
  if (url.pathname === "/login" || url.pathname.startsWith("/api/")) return fallback;
  return url.pathname + url.search;
}
