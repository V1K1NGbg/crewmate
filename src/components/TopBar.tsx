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
        <div className="h-14 flex items-center justify-between px-6 bg-surface/30 border-b border-border flex-shrink-0">
            <span className="text-sm font-medium text-text-2 tracking-wide">
                {activePage?.label ?? "Crewmate"}
            </span>
            <div className="flex items-center gap-2">
                <button
                    onClick={onSettingsToggle}
                    title="Settings"
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-all duration-200 ${
                        settingsOpen
                            ? "bg-accent/10 text-accent border-accent/20"
                            : "text-text-3 border-transparent hover:text-text-2 hover:bg-surface-2/50"
                    }`}
                >
                    <Settings size={15} />
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-all duration-200 ${
                        state.opencodeOverlayOpen
                            ? "bg-accent/10 text-accent border-accent/20"
                            : "text-text-3 border-transparent hover:text-text-2 hover:bg-surface-2/50"
                    }`}
                >
                    <Bot size={15} />
                    <Circle
                        size={6}
                        className={
                            state.opencodeAvailable
                                ? "fill-success text-success"
                                : "fill-text-3 text-text-3"
                        }
                    />
                    <span className="font-medium">AI</span>
                </button>
            </div>
        </div>
    );
}
