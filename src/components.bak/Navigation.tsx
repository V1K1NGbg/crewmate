"use client";

import { useEffect, useState } from "react";
import {
    Mail,
    Calendar,
    FileText,
    CheckSquare,
    Globe,
    Plus,
    X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";

const ICON_MAP: Record<
    string,
    React.ComponentType<{ size?: number; className?: string }>
> = { Mail, Calendar, FileText, CheckSquare, Globe };

interface AddPageModalState {
    open: boolean;
    type: "custom" | "notes" | "tasks";
    label: string;
    url: string;
}

export default function Navigation() {
    const { state, dispatch } = useApp();
    const [modal, setModal] = useState<AddPageModalState>({
        open: false,
        type: "custom",
        label: "",
        url: "",
    });
    const [contextMenu, setContextMenu] = useState<{
        pageId: string;
        x: number;
        y: number;
    } | null>(null);

    useEffect(() => {
        const close = () => setContextMenu(null);
        window.addEventListener("click", close);
        return () => window.removeEventListener("click", close);
    }, []);

    function addPage() {
        if (!modal.label.trim()) return;
        const id = `custom-${Date.now()}`;
        dispatch({
            type: "ADD_PAGE",
            page: {
                id,
                type: modal.type,
                label: modal.label.trim(),
                icon:
                    modal.type === "custom"
                        ? "Globe"
                        : modal.type === "notes"
                          ? "FileText"
                          : "CheckSquare",
                url: modal.type === "custom" ? modal.url : undefined,
            },
        });
        setModal({ open: false, type: "custom", label: "", url: "" });
    }

    return (
        <>
            <nav className="flex flex-col items-center py-5 gap-3 bg-[#0d1117]/60 border-r border-[#21262d]/50 w-[72px] flex-shrink-0">
                {state.pages.map((page) => {
                    const Icon = ICON_MAP[page.icon] ?? Globe;
                    const isActive = state.activePage === page.id;
                    return (
                        <button
                            key={page.id}
                            onClick={() =>
                                dispatch({
                                    type: "SET_ACTIVE_PAGE",
                                    id: page.id,
                                })
                            }
                            onContextMenu={(e) => {
                                if (page.type === "custom") {
                                    e.preventDefault();
                                    setContextMenu({
                                        pageId: page.id,
                                        x: e.clientX,
                                        y: e.clientY,
                                    });
                                }
                            }}
                            title={`${page.label}  [${page.keybinding}]`}
                            className={`relative w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-200 ${
                                isActive
                                    ? "bg-[#58a6ff]/15 text-[#58a6ff]"
                                    : "text-[#484f58] hover:text-[#8b949e] hover:bg-[#161b22]"
                            }`}
                        >
                            <Icon size={24} />
                            {isActive && (
                                <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[#58a6ff] rounded-r-full" />
                            )}
                        </button>
                    );
                })}

                <div className="flex-1" />

                <button
                    onClick={() =>
                        setModal({
                            open: true,
                            type: "custom",
                            label: "",
                            url: "",
                        })
                    }
                    title="Add page"
                    className="w-12 h-12 flex items-center justify-center text-[#30363d] hover:text-[#484f58] hover:bg-[#161b22] rounded-xl transition-all duration-200"
                >
                    <Plus size={22} strokeWidth={1.5} />
                </button>
            </nav>

            {/* Context menu for custom pages */}
            {contextMenu && (
                <div
                    className="fixed z-50 bg-[#161b22] border border-[#21262d] rounded-xl shadow-2xl py-1.5 min-w-[140px]"
                    style={{
                        top: contextMenu.y,
                        left: contextMenu.x,
                        animation: "fadeIn 120ms ease-out",
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => {
                            dispatch({
                                type: "REMOVE_PAGE",
                                id: contextMenu.pageId,
                            });
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm text-[#f85149] hover:bg-[#4a0f0e] rounded-lg transition-colors"
                    >
                        Remove page
                    </button>
                </div>
            )}

            {/* Add page modal */}
            {modal.open && (
                <div
                    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm"
                    onClick={() => setModal((m) => ({ ...m, open: false }))}
                    style={{ animation: "fadeIn 150ms ease-out" }}
                >
                    <div
                        className="bg-[#0d1117] border border-[#21262d] rounded-2xl w-[380px] shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            animation:
                                "slideDown 200ms cubic-bezier(0.16,1,0.3,1)",
                        }}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#21262d]">
                            <span className="text-base font-semibold text-[#e6edf3]">
                                Add page
                            </span>
                            <button
                                onClick={() =>
                                    setModal((m) => ({ ...m, open: false }))
                                }
                                className="w-7 h-7 flex items-center justify-center text-[#484f58] hover:text-[#e6edf3] hover:bg-[#21262d] rounded-lg transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex flex-col gap-3 p-5">
                            <div className="flex gap-2">
                                {(["custom", "notes", "tasks"] as const).map(
                                    (t) => (
                                        <button
                                            key={t}
                                            onClick={() =>
                                                setModal((m) => ({
                                                    ...m,
                                                    type: t,
                                                }))
                                            }
                                            className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-all duration-200 ${
                                                modal.type === t
                                                    ? "bg-[#58a6ff]/15 text-[#58a6ff] border-[#58a6ff]/30"
                                                    : "text-[#484f58] border-[#21262d] hover:border-[#30363d] hover:text-[#8b949e]"
                                            }`}
                                        >
                                            {t.charAt(0).toUpperCase() +
                                                t.slice(1)}
                                        </button>
                                    ),
                                )}
                            </div>
                            <input
                                autoFocus
                                className="w-full bg-[#161b22] border border-[#21262d] rounded-xl px-3.5 py-2.5 text-base text-[#e6edf3] outline-none focus:border-[#58a6ff]/50 placeholder:text-[#30363d] transition-colors"
                                placeholder="Page label"
                                value={modal.label}
                                onChange={(e) =>
                                    setModal((m) => ({
                                        ...m,
                                        label: e.target.value,
                                    }))
                                }
                                onKeyDown={(e) =>
                                    e.key === "Enter" && addPage()
                                }
                            />
                            {modal.type === "custom" && (
                                <input
                                    className="w-full bg-[#161b22] border border-[#21262d] rounded-xl px-3.5 py-2.5 text-base text-[#e6edf3] outline-none focus:border-[#58a6ff]/50 placeholder:text-[#30363d] transition-colors"
                                    placeholder="https://example.com"
                                    value={modal.url}
                                    onChange={(e) =>
                                        setModal((m) => ({
                                            ...m,
                                            url: e.target.value,
                                        }))
                                    }
                                    onKeyDown={(e) =>
                                        e.key === "Enter" && addPage()
                                    }
                                />
                            )}
                            <button
                                onClick={addPage}
                                disabled={!modal.label.trim()}
                                className="w-full py-2.5 bg-[#238636] text-white text-base font-semibold rounded-xl hover:bg-[#2ea043] transition-colors disabled:opacity-40"
                            >
                                Add page
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
