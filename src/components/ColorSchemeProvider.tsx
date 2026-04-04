"use client";

import { useLayoutEffect } from "react";
import { useApp } from "@/context/AppContext";
import { COLOR_SCHEMES, type ColorSchemeColors } from "@/types";

function applyColors(colors: ColorSchemeColors) {
  const root = document.documentElement;
  root.style.setProperty("--color-bg", colors.bg);
  root.style.setProperty("--color-surface", colors.surface);
  root.style.setProperty("--color-surface-2", colors.surface2);
  root.style.setProperty("--color-border", colors.border);
  root.style.setProperty("--color-border-2", colors.border2);
  root.style.setProperty("--color-text", colors.text);
  root.style.setProperty("--color-text-2", colors.text2);
  root.style.setProperty("--color-text-3", colors.text3);
  root.style.setProperty("--color-accent", colors.accent);
  root.style.setProperty("--color-accent-hover", colors.accentHover);
  root.style.setProperty("--color-accent-muted", colors.accentMuted);
  root.style.setProperty("--color-success", colors.success);
  root.style.setProperty("--color-warning", colors.warning);
  root.style.setProperty("--color-danger", colors.danger);
}

export function ColorSchemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state } = useApp();

  useLayoutEffect(() => {
    const schemeId = state.pageSettings.general.colorScheme ?? "default";
    const scheme = COLOR_SCHEMES.find((s) => s.id === schemeId);
    if (scheme) {
      applyColors(scheme.colors);
    } else {
      const defaultScheme = COLOR_SCHEMES.find((s) => s.id === "default");
      if (defaultScheme) {
        applyColors(defaultScheme.colors);
      }
    }
  }, [state.pageSettings.general.colorScheme]);

  return <>{children}</>;
}
