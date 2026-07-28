"use client";

import { useEffect, useState } from "react";
import { Globe, Plus, X } from "lucide-react";
import { useApp } from "@crewmate/state";
import { PLUGINS, getPlugin } from "@/plugins/registry";

interface AddPageModalState {
  open: boolean;
  type: string;
  label: string;
  url: string;
}

function iconForPage(pageType: string) {
  return getPlugin(pageType)?.icon ?? Globe;
}

function colorForPage(pageType: string) {
  return getPlugin(pageType)?.color ?? "";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        url: modal.type === "custom" ? modal.url : undefined,
      },
    });
    setModal({ open: false, type: "custom", label: "", url: "" });
  }

  const enabledPlugins = PLUGINS.filter((p) =>
    state.pages.some((page) => page.type === p.id),
  );

  return (
    <>
      <nav className="flex flex-col items-center py-4 gap-1.5 bg-surface/50 border-r border-border w-16 flex-shrink-0">
        {state.pages.map((page) => {
          const Icon = iconForPage(page.type);
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
              className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 ${
                isActive ? "" : "hover:bg-surface-2/50"
              }`}
              style={
                isActive
                  ? {
                      color: activeColor,
                      backgroundColor: `color-mix(in srgb, ${activeColor} 12%, transparent)`,
                    }
                  : pageColor
                    ? { color: pageColor, opacity: 0.7 }
                    : undefined
              }
            >
              <Icon
                size={20}
                className={!isActive && !pageColor ? "text-text-3" : undefined}
              />
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
          className="w-10 h-10 flex items-center justify-center text-text-3 hover:text-text-2 hover:bg-surface-2/50 rounded-xl transition-all duration-200"
        >
          <Plus size={18} strokeWidth={1.5} />
        </button>
      </nav>

      {contextMenu && (
        <div
          className="fixed z-50 bg-surface border border-border-2 rounded-xl shadow-2xl py-1 min-w-[140px]"
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
            className="w-full text-left px-3 py-1.5 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors"
          >
            Remove page
          </button>
        </div>
      )}

      {modal.open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
          onClick={() => setModal((m) => ({ ...m, open: false }))}
          style={{ animation: "fadeIn 150ms ease-out" }}
        >
          <div
            className="bg-surface border border-border-2 rounded-2xl w-[380px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: "slideDown 200ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="text-sm font-semibold text-text">Add page</span>
              <button
                onClick={() => setModal((m) => ({ ...m, open: false }))}
                className="w-7 h-7 flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-3 p-5">
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: "custom", label: "Custom" },
                  ...enabledPlugins.map((p) => ({ id: p.id, label: p.label })),
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() =>
                      setModal((m) => ({
                        ...m,
                        type: t.id,
                      }))
                    }
                    style={{ padding: "2px 12px" }}
                    className={`flex-1 text-sm rounded-xl border font-medium transition-all duration-200 ${
                      modal.type === t.id
                        ? "bg-accent/15 text-accent border-accent/30"
                        : "text-text-3 border-border hover:border-border-2 hover:text-text-2"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <input
                autoFocus
                className="w-full bg-bg border border-border-2 rounded-xl px-3.5 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
                placeholder="Page label"
                value={modal.label}
                onChange={(e) =>
                  setModal((m) => ({
                    ...m,
                    label: e.target.value,
                  }))
                }
                onKeyDown={(e) => e.key === "Enter" && addPage()}
              />
              {modal.type === "custom" && (
                <input
                  className="w-full bg-bg border border-border-2 rounded-xl px-3.5 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
                  placeholder="https://example.com"
                  value={modal.url}
                  onChange={(e) =>
                    setModal((m) => ({
                      ...m,
                      url: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && addPage()}
                />
              )}
              <button
                onClick={addPage}
                disabled={!modal.label.trim()}
                className="w-full py-2.5 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-40"
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
