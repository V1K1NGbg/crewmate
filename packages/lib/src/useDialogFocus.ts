"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

export function useDialogFocus(active = true) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    (dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog)?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const elements = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      const current = elements.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? current <= 0 ? elements.length - 1 : current - 1
        : current >= elements.length - 1 ? 0 : current + 1;
      event.preventDefault();
      elements[next].focus();
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [active]);
  return ref;
}
