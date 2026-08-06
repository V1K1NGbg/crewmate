"use client";

import { useState } from "react";
import { Globe, RefreshCw } from "lucide-react";
import {
  normalizeCustomPageUrl,
  toEmbeddableCustomPageUrl,
} from "@crewmate/state";

export default function CustomPage({ url }: { url?: string }) {
  const [reloadVersion, setReloadVersion] = useState(0);
  const normalizedUrl = url ? normalizeCustomPageUrl(url) : null;
  if (!normalizedUrl) {
    return (
      <div className="flex flex-1 items-center justify-center bg-bg text-sm text-text-3">
        No valid URL is configured for this page.
      </div>
    );
  }

  const embeddedUrl = toEmbeddableCustomPageUrl(normalizedUrl);
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-bg">
      <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-border px-3">
        <Globe size={13} className="text-text-3" />
        <span className="min-w-0 flex-1 truncate text-xs text-text-3">
          {embeddedUrl}
        </span>
        <button
          type="button"
          onClick={() => setReloadVersion((version) => version + 1)}
          className="flex items-center gap-1.5 rounded-lg border border-border-2 px-2.5 py-1 text-xs text-text-2 hover:border-accent hover:text-text"
        >
          <RefreshCw size={12} /> Reload
        </button>
      </div>
      <iframe
        key={reloadVersion}
        src={embeddedUrl}
        title="Custom page"
        className="w-full flex-1 border-none bg-bg"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
