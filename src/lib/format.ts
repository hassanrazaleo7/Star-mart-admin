const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return `${dateTime.format(date)} UTC`;
}

export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const browser =
    /Edg\//.test(userAgent) ? "Edge" :
    /OPR\//.test(userAgent) ? "Opera" :
    /Chrome\//.test(userAgent) ? "Chrome" :
    /Firefox\//.test(userAgent) ? "Firefox" :
    /Safari\//.test(userAgent) ? "Safari" :
    /curl\//.test(userAgent) ? "curl" : "Browser";
  const os =
    /Windows/.test(userAgent) ? "Windows" :
    /Mac OS X|Macintosh/.test(userAgent) ? "macOS" :
    /iPhone|iPad/.test(userAgent) ? "iOS" :
    /Android/.test(userAgent) ? "Android" :
    /Linux/.test(userAgent) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

const qtyFormatter = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 3 });

/** 1.5 + "kg" → "1.5 kg"; integers print without decimals. */
export function formatQty(qty: number, unit?: string | null): string {
  const n = qtyFormatter.format(qty);
  return unit ? `${n} ${unit}` : n;
}

/** Store-local calendar date, e.g. "19 Oct 2026". */
export function formatDate(value: Date | string | null | undefined, timeZone = "Asia/Karachi"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone }).format(date);
}

/** Store-local date and time. */
export function formatLocalDateTime(value: Date | string | null | undefined, timeZone = "Asia/Karachi"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}
