"use client";

import { useSyncExternalStore } from "react";
import { useApp } from "@crewmate/state";
import { getPlugin } from "@/plugins/registry";

function colorForPage(pageType: string) {
  const plugin = getPlugin(pageType);
  return plugin ? `var(--color-${plugin.id}, ${plugin.color})` : "";
}

export default function Navigation() {
  const { state, dispatch } = useApp();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <nav className="flex flex-col items-center py-4 gap-1.5 bg-surface/50 border-r border-border w-16 flex-shrink-0">
      {state.pages.map((page) => {
        const plugin = getPlugin(page.type);
        if (!plugin) return null;
        const Icon = plugin.icon;
        const isActive = mounted && state.activePage === page.id;
        const pageColor = colorForPage(page.type);
        const activeColor = pageColor || "var(--color-accent)";
        return (
          <button
            key={page.id}
            onClick={() =>
              dispatch({
                type: "SET_ACTIVE_PAGE",
                id: page.id,
              })
            }
            title={`${page.label}  [${page.keybinding}]`}
            aria-label={`Open ${page.label}`}
            className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 ${
              isActive ? "" : "hover:bg-surface-2/50"
            }`}
            style={
              isActive
                ? {
                    color: activeColor,
                    backgroundColor: `color-mix(in srgb, ${activeColor} 12%, transparent)`,
                  }
                : { color: pageColor, opacity: 0.7 }
            }
          >
            <Icon size={20} />
            {isActive && (
              <div
                className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full"
                style={{ backgroundColor: activeColor }}
              />
            )}
          </button>
        );
      })}
      <div className="flex-1" />
    </nav>
  );
}
