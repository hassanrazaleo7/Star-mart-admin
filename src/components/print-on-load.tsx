"use client";

import { useEffect } from "react";

/** Opens the browser print dialog once the page has rendered. */
export function PrintOnLoad({ delayMs = 300 }: { delayMs?: number }) {
  useEffect(() => {
    const t = window.setTimeout(() => window.print(), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);
  return null;
}
