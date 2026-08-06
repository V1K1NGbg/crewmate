"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Globe, Pencil, Plus, Trash2, X } from "lucide-react";
import { normalizeCustomPageUrl, useApp } from "@crewmate/state";
import { getPlugin } from "@/plugins/registry";

interface AddPageModalState {
  open: boolean;
  pageId: string | null;
  label: string;
  url: string;
}

function iconForPage(pageType: string) {
  return getPlugin(pageType)?.icon ?? Globe;
}

function colorForPage(pageType: string) {
  const plugin = getPlugin(pageType);
  return plugin ? `var(--color-${plugin.id}, ${plugin.color})` : "";
}

export default function Navigation() {
  const { state, dispatch } = useApp();
  const [modal, setModal] = useState<AddPageModalState>({
    open: false,
    pageId: null,
    label: "",
    url: "",
  });
  const [contextMenu, setContextMenu] = useState<{
    pageId: string;
    x: number;
    y: number;
  } | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  function addPage() {
    const url = normalizeCustomPageUrl(modal.url);
    if (!modal.label.trim() || !url) {
      return;
    }
    if (modal.pageId) {
      dispatch({
        type: "UPDATE_PAGE",
        id: modal.pageId,
        updates: { label: modal.label, url },
      });
      setModal({ open: false, pageId: null, label: "", url: "" });
      return;
    }
    const id = `custom-${Date.now()}`;
    dispatch({
      type: "ADD_PAGE",
      page: {
        id,
        type: "custom",
        label: modal.label.trim(),
        url,
      },
    });
    setModal({ open: false, pageId: null, label: "", url: "" });
  }

  function removePage(pageId: string) {
    dispatch({ type: "REMOVE_PAGE", id: pageId });
    setContextMenu(null);
  }

  const contextPage = contextMenu
    ? state.pages.find((page) => page.id === contextMenu.pageId)
    : undefined;

  return (
    <>
      <nav className="flex flex-col items-center py-4 gap-1.5 bg-surface/50 border-r border-border w-16 flex-shrink-0">
        {state.pages.map((page) => {
          const Icon = iconForPage(page.type);
          const isActive = mounted && state.activePage === page.id;
          const pageColor = colorForPage(page.type);
          const activeColor = pageColor || "var(--color-accent)";
          return (
            <div
              key={page.id}
              className="relative"
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  pageId: page.id,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
            >
              <button
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
                    : pageColor
                      ? { color: pageColor, opacity: 0.7 }
                      : undefined
                }
              >
                <Icon
                  size={20}
                  className={
                    !isActive && !pageColor ? "text-text-3" : undefined
                  }
                />
                {isActive && (
                  <div
                    className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full"
                    style={{ backgroundColor: activeColor }}
                  />
                )}
              </button>
            </div>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() =>
            setModal({
              open: true,
              pageId: null,
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
          {contextPage?.type === "custom" && (
            <>
              <button
                onClick={() => {
                  setModal({
                    open: true,
                    pageId: contextPage.id,
                    label: contextPage.label,
                    url: contextPage.url ?? "",
                  });
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-2 hover:bg-surface-2 hover:text-text"
              >
                <Pencil size={13} /> Edit page
              </button>
            </>
          )}
          <button
            onClick={() => removePage(contextMenu.pageId)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger hover:bg-danger/10"
          >
            <Trash2 size={13} /> Remove page
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
              <span className="text-sm font-semibold text-text">
                {modal.pageId ? "Edit page" : "Add page"}
              </span>
              <button
                onClick={() => setModal((m) => ({ ...m, open: false }))}
                className="w-7 h-7 flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-3 p-5">
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
              <button
                onClick={addPage}
                disabled={!modal.label.trim() || !normalizeCustomPageUrl(modal.url)}
                className="w-full py-2.5 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-40"
              >
                {modal.pageId ? "Save page" : "Add and open page"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
