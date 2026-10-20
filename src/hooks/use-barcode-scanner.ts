"use client";

import { useEffect, useEffectEvent, useRef } from "react";

type Options = {
  /** Minimum characters for a burst to count as a scan. */
  minLength?: number;
  /** Maximum gap between keystrokes (ms); humans type slower than this. */
  maxGapMs?: number;
  enabled?: boolean;
};

/**
 * Listens for keyboard-wedge barcode scanners: a fast burst of characters
 * terminated by Enter. Fields marked `data-scanner-ignore` opt out so typing
 * in notes or search boxes is never swallowed.
 */
export function useBarcodeScanner(onScan: (code: string) => void, options: Options = {}) {
  const { minLength = 6, maxGapMs = 50, enabled = true } = options;
  const buffer = useRef("");
  const lastKeyAt = useRef(0);
  const emitScan = useEffectEvent((code: string) => onScan(code));

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-scanner-ignore]")) return;
      const now = performance.now();
      if (now - lastKeyAt.current > maxGapMs) buffer.current = "";
      lastKeyAt.current = now;

      if (event.key === "Enter") {
        const code = buffer.current;
        buffer.current = "";
        if (code.length >= minLength) {
          event.preventDefault();
          event.stopPropagation();
          emitScan(code);
        }
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        buffer.current += event.key;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, maxGapMs, minLength]);
}
