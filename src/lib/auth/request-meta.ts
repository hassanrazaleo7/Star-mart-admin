// Pure helpers (no Next.js imports) so they can run inside Auth.js `authorize`.

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const ip = first || headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}

export function getUserAgent(headers: Headers): string | null {
  const ua = headers.get("user-agent")?.trim();
  return ua ? ua.slice(0, 512) : null;
}

export type RequestMeta = { ip: string; userAgent: string | null };
