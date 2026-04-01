"use client";

import { useApp } from "@/context/AppContext";
import { X, CheckCircle, Info, AlertCircle } from "lucide-react";

const STYLE_MAP = {
  success: {
    bg: "bg-[#1e4620] border-[#238636]",
    text: "text-[#7ee787]",
    Icon: CheckCircle,
  },
  error: {
    bg: "bg-[#4a0f0e] border-[#da3633]",
    text: "text-[#f85149]",
    Icon: AlertCircle,
  },
  info: {
    bg: "bg-[#21262d] border-[#30363d]",
    text: "text-[#8b949e]",
    Icon: Info,
  },
} as const;

export default function Notification() {
  const { state, dispatch } = useApp();
  if (!state.notification) return null;

  const { message, type } = state.notification;
  const styles = STYLE_MAP[type];

  return (
    <div
      className={`fixed bottom-10 flex items-center gap-2.5 px-4 py-2.5 rounded-lg border shadow-2xl z-[100] text-sm max-w-sm ${styles.bg} ${styles.text}`}
      style={{
        left: "50%",
        animation: "slideUp 200ms cubic-bezier(0.16,1,0.3,1) both",
        willChange: "transform, opacity",
      }}
    >
      <styles.Icon size={15} />
      <span>{message}</span>
      <button
        onClick={() =>
          dispatch({ type: "SET_NOTIFICATION", notification: null })
        }
        className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}
