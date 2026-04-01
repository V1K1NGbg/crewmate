"use client";

import { useApp } from "@/context/AppContext";
import { Bot, Circle, Settings } from "lucide-react";

export default function TopBar({
  onSettingsToggle,
  settingsOpen,
}: {
  onSettingsToggle: () => void;
  settingsOpen: boolean;
}) {
  const { state, dispatch } = useApp();
  const activePage = state.pages.find((p) => p.id === state.activePage);

  return (
    <div className="h-16 flex items-center justify-between px-8 bg-[#0d1117]/40 border-b border-[#21262d]/50 flex-shrink-0">
      <span className="text-base font-medium text-[#8b949e] tracking-wide">
        {activePage?.label ?? "Crewmate"}
      </span>

      <div className="flex items-center gap-2.5">
        <button
          onClick={onSettingsToggle}
          title="Settings"
          className={`flex items-center gap-2 px-4 py-2.5 text-base rounded-xl border transition-all duration-200 ${
            settingsOpen
              ? "bg-[#58a6ff]/10 text-[#58a6ff] border-[#58a6ff]/20"
              : "text-[#484f58] border-[#21262d] hover:border-[#30363d] hover:text-[#8b949e]"
          }`}
        >
          <Settings size={18} />
          <span className="font-medium">Settings</span>
        </button>
        <button
          onClick={() =>
            dispatch({
              type: "SET_OPENCODE_OVERLAY_OPEN",
              open: !state.opencodeOverlayOpen,
            })
          }
          title="Toggle AI assistant (O)"
          className={`flex items-center gap-2 px-4 py-2.5 text-base rounded-xl border transition-all duration-200 ${
            state.opencodeOverlayOpen
              ? "bg-[#58a6ff]/10 text-[#58a6ff] border-[#58a6ff]/20"
              : "text-[#484f58] border-[#21262d] hover:border-[#30363d] hover:text-[#8b949e]"
          }`}
        >
          <Bot size={18} />
          <Circle
            size={8}
            className={
              state.opencodeAvailable
                ? "fill-[#3fb950] text-[#3fb950]"
                : "fill-[#30363d] text-[#30363d]"
            }
          />
          <span className="font-medium">AI</span>
        </button>
      </div>
    </div>
  );
}
