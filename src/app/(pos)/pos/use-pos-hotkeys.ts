"use client";

import { useEffect, useEffectEvent } from "react";

export type PosHotkeyHandlers = {
  focusSearch: () => void;
  focusCustomer: () => void;
  openCamera: () => void;
  focusDiscount: () => void;
  openPayment: () => void;
  escape: () => void;
  stepQty: (delta: number) => void;
  removeActive: () => void;
  hold: () => void;
  openHeld: () => void;
};

export const POS_HOTKEYS = [
  ["F2", "Search products"],
  ["F4", "Customer"],
  ["F7", "Camera scan"],
  ["F8", "Discount code"],
  ["F9", "Pay"],
  ["+ / −", "Change quantity of the highlighted line"],
  ["Delete", "Remove the highlighted line"],
  ["Ctrl+H", "Hold sale"],
  ["Ctrl+Shift+H", "Held sales"],
  ["Esc", "Close dialog"],
] as const;

const isEditable = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
};

/** Global keyboard shortcuts for the till. Function keys work even inside inputs; +/−/Delete only outside them. */
export function usePosHotkeys(handlers: PosHotkeyHandlers) {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    const editing = isEditable(event.target);
    const key = event.key;
    if (event.ctrlKey && !event.altKey && (key === "h" || key === "H")) {
      event.preventDefault();
      if (event.shiftKey) handlers.openHeld();
      else handlers.hold();
      return;
    }
    switch (key) {
      case "F2": event.preventDefault(); handlers.focusSearch(); return;
      case "F4": event.preventDefault(); handlers.focusCustomer(); return;
      case "F7": event.preventDefault(); handlers.openCamera(); return;
      case "F8": event.preventDefault(); handlers.focusDiscount(); return;
      case "F9": event.preventDefault(); handlers.openPayment(); return;
      case "Escape": handlers.escape(); return;
    }
    if (editing) return;
    if (key === "+" || key === "=") { event.preventDefault(); handlers.stepQty(1); }
    else if (key === "-" || key === "_") { event.preventDefault(); handlers.stepQty(-1); }
    else if (key === "Delete" || key === "Backspace") { event.preventDefault(); handlers.removeActive(); }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => handle(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
