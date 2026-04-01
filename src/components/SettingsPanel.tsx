"use client";

import { useState, useEffect } from "react";
import {
    X,
    Settings,
    Mail,
    Calendar,
    FileText,
    CheckSquare,
    Bot,
    RefreshCw,
    ChevronDown,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { fetchOpencodeModels } from "@/lib/opencode";

interface ModelOption {
    providerId: string;
    modelId: string;
    label: string;
}

const SECTIONS = [
    { id: "general", label: "General", icon: RefreshCw },
    { id: "ai", label: "AI Assistant", icon: Bot },
    { id: "gmail", label: "Gmail", icon: Mail },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "notes", label: "Notes", icon: FileText },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
    const { state, dispatch } = useApp();

    const [activeSection, setActiveSection] = useState<SectionId>("general");
    const [urlDraft, setUrlDraft] = useState(state.opencodeUrl);
    const [modelDraft, setModelDraft] = useState(state.assistantModel);
    const [suggestionModelDraft, setSuggestionModelDraft] = useState(
        state.pageSettings.gmail.suggestionModel,
    );
    const [models, setModels] = useState<ModelOption[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [dropdownTarget, setDropdownTarget] = useState<
        "assistant" | "suggestion"
    >("assistant");

    useEffect(() => {
        setUrlDraft(state.opencodeUrl);
        setModelDraft(state.assistantModel);
        setSuggestionModelDraft(state.pageSettings.gmail.suggestionModel);
    }, [
        state.opencodeUrl,
        state.assistantModel,
        state.pageSettings.gmail.suggestionModel,
    ]);

    async function loadModels() {
        setModelsLoading(true);
        try {
            const list = await fetchOpencodeModels(urlDraft);
            if (list.length > 0) setModels(list);
        } catch {
            /* ignore */
        } finally {
            setModelsLoading(false);
        }
    }

    function saveAI() {
        dispatch({ type: "SET_OPENCODE_URL", url: urlDraft });
        dispatch({ type: "SET_ASSISTANT_MODEL", model: modelDraft });
        dispatch({
            type: "UPDATE_PAGE_SETTINGS",
            key: "gmail",
            settings: { suggestionModel: suggestionModelDraft },
        });
        setShowModelDropdown(false);
    }

    function openDropdown(target: "assistant" | "suggestion") {
        setDropdownTarget(target);
        if (models.length > 0) {
            setShowModelDropdown(true);
        } else {
            loadModels().then(() => setShowModelDropdown(true));
        }
    }

    function selectModel(value: string) {
        if (dropdownTarget === "assistant") setModelDraft(value);
        else setSuggestionModelDraft(value);
        setShowModelDropdown(false);
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="flex flex-col bg-[#0d1117] border border-[#21262d] rounded-2xl shadow-2xl overflow-hidden"
                style={{
                    width: "90%",
                    height: "90%",
                    maxWidth: 940,
                    maxHeight: 1170,
                    animation: "fadeIn 200ms cubic-bezier(0.16,1,0.3,1) both",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-[#21262d] flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <Settings size={20} className="text-[#58a6ff]" />
                        <span className="text-base font-semibold text-[#e6edf3]">
                            Settings
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center text-[#484f58] hover:text-[#c9d1d9] hover:bg-[#161b22] rounded-lg transition-colors"
                        title="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar navigation */}
                    <nav className="w-52 flex-shrink-0 border-r border-[#21262d] bg-[#0d1117] overflow-y-auto py-2">
                        {SECTIONS.map((s) => {
                            const Icon = s.icon;
                            const isActive = activeSection === s.id;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveSection(s.id)}
                                    className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                                        isActive
                                            ? "text-[#f0f6fc] bg-[#161b22] border-l-2 border-[#58a6ff]"
                                            : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]/50 border-l-2 border-transparent"
                                    }`}
                                >
                                    <Icon
                                        size={16}
                                        className={
                                            isActive ? "text-[#58a6ff]" : ""
                                        }
                                    />
                                    {s.label}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Content area */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="max-w-xl mx-auto px-8 py-6">
                            {/* Section title */}
                            <h2 className="text-lg font-semibold text-[#f0f6fc] mb-1">
                                {
                                    SECTIONS.find((s) => s.id === activeSection)
                                        ?.label
                                }
                            </h2>
                            <p className="text-sm text-[#484f58] mb-6">
                                {activeSection === "general" &&
                                    "Global preferences that apply across all pages."}
                                {activeSection === "ai" &&
                                    "Configure the AI assistant server and model selection."}
                                {activeSection === "gmail" &&
                                    "Customize how Gmail threads are loaded and displayed."}
                                {activeSection === "calendar" &&
                                    "Calendar display and timezone settings."}
                                {activeSection === "notes" &&
                                    "Editor appearance and auto-save behavior."}
                                {activeSection === "tasks" &&
                                    "Default filtering and sorting for your task list."}
                            </p>

                            <div className="flex flex-col gap-5">
                                {activeSection === "general" && (
                                    <SettingRow
                                        label="Auto-refresh interval"
                                        description="Periodically refresh all pages to detect external changes"
                                    >
                                        <select
                                            className="settings-select"
                                            value={
                                                state.pageSettings.general
                                                    .autoRefreshInterval ?? 0
                                            }
                                            onChange={(e) =>
                                                dispatch({
                                                    type: "UPDATE_PAGE_SETTINGS",
                                                    key: "general",
                                                    settings: {
                                                        autoRefreshInterval:
                                                            Number(
                                                                e.target.value,
                                                            ),
                                                    },
                                                })
                                            }
                                        >
                                            <option value={0}>Off</option>
                                            <option value={15}>
                                                15 seconds
                                            </option>
                                            <option value={30}>
                                                30 seconds
                                            </option>
                                            <option value={60}>1 minute</option>
                                            <option value={120}>
                                                2 minutes
                                            </option>
                                            <option value={300}>
                                                5 minutes
                                            </option>
                                        </select>
                                    </SettingRow>
                                )}

                                {activeSection === "ai" && (
                                    <>
                                        <SettingRow label="Server URL">
                                            <input
                                                className="settings-input"
                                                value={urlDraft}
                                                onChange={(e) =>
                                                    setUrlDraft(e.target.value)
                                                }
                                                placeholder="http://localhost:4096"
                                            />
                                        </SettingRow>
                                        <SettingRow label="Assistant model">
                                            <div className="flex gap-2">
                                                <input
                                                    className="settings-input flex-1"
                                                    value={modelDraft}
                                                    onChange={(e) => {
                                                        setModelDraft(
                                                            e.target.value,
                                                        );
                                                        setShowModelDropdown(
                                                            false,
                                                        );
                                                    }}
                                                    placeholder="Default (server picks)"
                                                />
                                                <button
                                                    onClick={() =>
                                                        openDropdown(
                                                            "assistant",
                                                        )
                                                    }
                                                    disabled={modelsLoading}
                                                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#58a6ff] border border-[#30363d] rounded-lg hover:bg-[#161b22] transition-colors disabled:opacity-50"
                                                >
                                                    <RefreshCw
                                                        size={14}
                                                        className={
                                                            modelsLoading
                                                                ? "animate-spin"
                                                                : ""
                                                        }
                                                    />
                                                    Browse
                                                </button>
                                            </div>
                                        </SettingRow>
                                        <SettingRow label="Suggestion model (Gmail)">
                                            <div className="flex gap-2">
                                                <input
                                                    className="settings-input flex-1"
                                                    value={suggestionModelDraft}
                                                    onChange={(e) => {
                                                        setSuggestionModelDraft(
                                                            e.target.value,
                                                        );
                                                        setShowModelDropdown(
                                                            false,
                                                        );
                                                    }}
                                                    placeholder="Same as assistant"
                                                />
                                                <button
                                                    onClick={() =>
                                                        openDropdown(
                                                            "suggestion",
                                                        )
                                                    }
                                                    disabled={modelsLoading}
                                                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#58a6ff] border border-[#30363d] rounded-lg hover:bg-[#161b22] transition-colors disabled:opacity-50"
                                                >
                                                    <RefreshCw
                                                        size={14}
                                                        className={
                                                            modelsLoading
                                                                ? "animate-spin"
                                                                : ""
                                                        }
                                                    />
                                                    Browse
                                                </button>
                                            </div>
                                        </SettingRow>
                                        {showModelDropdown &&
                                            models.length > 0 && (
                                                <div className="max-h-48 overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl">
                                                    <div className="px-3 py-1.5 text-xs text-[#484f58] uppercase tracking-wider border-b border-[#21262d] sticky top-0 bg-[#161b22]">
                                                        Select for{" "}
                                                        {dropdownTarget ===
                                                        "assistant"
                                                            ? "assistant"
                                                            : "suggestions"}
                                                    </div>
                                                    <button
                                                        onClick={() =>
                                                            selectModel("")
                                                        }
                                                        className="w-full text-left px-3 py-2 text-sm text-[#8b949e] hover:bg-[#21262d] border-b border-[#21262d]/50"
                                                    >
                                                        Default (server picks)
                                                    </button>
                                                    {models.map((m) => (
                                                        <button
                                                            key={`${m.providerId}/${m.modelId}`}
                                                            onClick={() =>
                                                                selectModel(
                                                                    `${m.providerId}/${m.modelId}`,
                                                                )
                                                            }
                                                            className="w-full text-left px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d]"
                                                        >
                                                            <div className="truncate">
                                                                {m.label}
                                                            </div>
                                                            <div className="text-xs text-[#484f58] truncate">
                                                                {m.modelId}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        <button
                                            onClick={saveAI}
                                            className="w-full py-2.5 bg-[#238636] text-white text-sm font-semibold rounded-lg hover:bg-[#2ea043] transition-colors"
                                        >
                                            Save AI settings
                                        </button>
                                    </>
                                )}

                                {activeSection === "gmail" && (
                                    <SettingRow label="Max threads">
                                        <select
                                            className="settings-select"
                                            value={
                                                state.pageSettings.gmail
                                                    .maxThreads
                                            }
                                            onChange={(e) =>
                                                dispatch({
                                                    type: "UPDATE_PAGE_SETTINGS",
                                                    key: "gmail",
                                                    settings: {
                                                        maxThreads: Number(
                                                            e.target.value,
                                                        ),
                                                    },
                                                })
                                            }
                                        >
                                            <option value={10}>10</option>
                                            <option value={20}>20</option>
                                            <option value={50}>50</option>
                                        </select>
                                    </SettingRow>
                                )}

                                {activeSection === "calendar" && (
                                    <>
                                        <SettingRow label="Default view">
                                            <select
                                                className="settings-select"
                                                value={
                                                    state.pageSettings.calendar
                                                        .defaultView
                                                }
                                                onChange={(e) =>
                                                    dispatch({
                                                        type: "UPDATE_PAGE_SETTINGS",
                                                        key: "calendar",
                                                        settings: {
                                                            defaultView: e
                                                                .target
                                                                .value as
                                                                | "month"
                                                                | "week",
                                                        },
                                                    })
                                                }
                                            >
                                                <option value="month">
                                                    Month
                                                </option>
                                                <option value="week">
                                                    Week
                                                </option>
                                            </select>
                                        </SettingRow>
                                        <SettingToggle
                                            label="Show weekends"
                                            checked={
                                                state.pageSettings.calendar
                                                    .showWeekends
                                            }
                                            onChange={() =>
                                                dispatch({
                                                    type: "UPDATE_PAGE_SETTINGS",
                                                    key: "calendar",
                                                    settings: {
                                                        showWeekends:
                                                            !state.pageSettings
                                                                .calendar
                                                                .showWeekends,
                                                    },
                                                })
                                            }
                                        />
                                        <SettingToggle
                                            label="Show declined"
                                            checked={
                                                state.pageSettings.calendar
                                                    .showDeclined
                                            }
                                            onChange={() =>
                                                dispatch({
                                                    type: "UPDATE_PAGE_SETTINGS",
                                                    key: "calendar",
                                                    settings: {
                                                        showDeclined:
                                                            !state.pageSettings
                                                                .calendar
                                                                .showDeclined,
                                                    },
                                                })
                                            }
                                        />
                                        <SettingRow
                                            label="Timezone"
                                            description="IANA timezone name (e.g. America/New_York, Europe/Berlin)"
                                        >
                                            <input
                                                className="settings-input"
                                                value={
                                                    state.pageSettings.calendar
                                                        .timezone ??
                                                    Intl.DateTimeFormat().resolvedOptions()
                                                        .timeZone
                                                }
                                                onChange={(e) =>
                                                    dispatch({
                                                        type: "UPDATE_PAGE_SETTINGS",
                                                        key: "calendar",
                                                        settings: {
                                                            timezone:
                                                                e.target.value,
                                                        },
                                                    })
                                                }
                                                placeholder="e.g. America/New_York"
                                            />
                                        </SettingRow>
                                    </>
                                )}

                                {activeSection === "notes" && (
                                    <>
                                        <SettingRow label="Font size">
                                            <select
                                                className="settings-select"
                                                value={
                                                    state.pageSettings.notes
                                                        .fontSize ?? 15
                                                }
                                                onChange={(e) =>
                                                    dispatch({
                                                        type: "UPDATE_PAGE_SETTINGS",
                                                        key: "notes",
                                                        settings: {
                                                            fontSize: Number(
                                                                e.target.value,
                                                            ),
                                                        },
                                                    })
                                                }
                                            >
                                                <option value={12}>12px</option>
                                                <option value={13}>13px</option>
                                                <option value={14}>
                                                    14px (default)
                                                </option>
                                                <option value={15}>15px</option>
                                                <option value={16}>16px</option>
                                                <option value={18}>18px</option>
                                            </select>
                                        </SettingRow>
                                        <SettingRow label="Auto-save delay">
                                            <select
                                                className="settings-select"
                                                value={
                                                    state.pageSettings.notes
                                                        .autoSaveDelay ?? 1000
                                                }
                                                onChange={(e) =>
                                                    dispatch({
                                                        type: "UPDATE_PAGE_SETTINGS",
                                                        key: "notes",
                                                        settings: {
                                                            autoSaveDelay:
                                                                Number(
                                                                    e.target
                                                                        .value,
                                                                ),
                                                        },
                                                    })
                                                }
                                            >
                                                <option value={500}>
                                                    0.5s
                                                </option>
                                                <option value={1000}>
                                                    1s (default)
                                                </option>
                                                <option value={2000}>2s</option>
                                                <option value={5000}>5s</option>
                                            </select>
                                        </SettingRow>
                                    </>
                                )}

                                {activeSection === "tasks" && (
                                    <>
                                        <SettingRow label="Default filter">
                                            <select
                                                className="settings-select"
                                                value={
                                                    state.pageSettings.tasks
                                                        .defaultFilter ?? "all"
                                                }
                                                onChange={(e) =>
                                                    dispatch({
                                                        type: "UPDATE_PAGE_SETTINGS",
                                                        key: "tasks",
                                                        settings: {
                                                            defaultFilter: e
                                                                .target
                                                                .value as
                                                                | "all"
                                                                | "pending"
                                                                | "in-progress"
                                                                | "done",
                                                        },
                                                    })
                                                }
                                            >
                                                <option value="all">All</option>
                                                <option value="pending">
                                                    Pending
                                                </option>
                                                <option value="in-progress">
                                                    In progress
                                                </option>
                                                <option value="done">
                                                    Done
                                                </option>
                                            </select>
                                        </SettingRow>
                                        <SettingRow label="Sort by">
                                            <select
                                                className="settings-select"
                                                value={
                                                    state.pageSettings.tasks
                                                        .sortBy ?? "priority"
                                                }
                                                onChange={(e) =>
                                                    dispatch({
                                                        type: "UPDATE_PAGE_SETTINGS",
                                                        key: "tasks",
                                                        settings: {
                                                            sortBy: e.target
                                                                .value as
                                                                | "priority"
                                                                | "dueDate"
                                                                | "createdAt",
                                                        },
                                                    })
                                                }
                                            >
                                                <option value="priority">
                                                    Priority
                                                </option>
                                                <option value="dueDate">
                                                    Due date
                                                </option>
                                                <option value="createdAt">
                                                    Created date
                                                </option>
                                            </select>
                                        </SettingRow>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Reusable setting row components ─────────────────────────────────────── */

function SettingRow({
    label,
    description,
    children,
}: {
    label: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5 pb-5 border-b border-[#21262d]/50 last:border-b-0 last:pb-0">
            <label className="text-sm font-medium text-[#e6edf3]">
                {label}
            </label>
            {children}
            {description && (
                <span className="text-xs text-[#484f58]">{description}</span>
            )}
        </div>
    );
}

function SettingToggle({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: () => void;
}) {
    return (
        <div className="flex items-center justify-between pb-5 border-b border-[#21262d]/50 last:border-b-0 last:pb-0">
            <span className="text-sm font-medium text-[#e6edf3]">{label}</span>
            <button
                onClick={onChange}
                className={`relative rounded-full transition-colors ${checked ? "bg-[#58a6ff]" : "bg-[#30363d]"}`}
                style={{ height: 22, width: 40 }}
            >
                <div
                    className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[20px]" : "translate-x-[3px]"}`}
                />
            </button>
        </div>
    );
}
