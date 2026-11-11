"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useApp } from "@crewmate/state";
import { fetchAIModels, normalizeAIServerUrl, SettingRow } from "@crewmate/lib";

interface ModelOption {
  id: string;
  label: string;
}

/** OpenAI-compatible endpoint and model selection for every AI feature. */
export default function AISection() {
  const { state, dispatch, notify } = useApp();
  const [urlDraft, setUrlDraft] = useState(state.aiServerUrl);
  const [modelDraft, setModelDraft] = useState(state.assistantModel);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showAssistantDropdown, setShowAssistantDropdown] = useState(false);

  async function loadModels() {
    setModelsLoading(true);
    try {
      const list = await fetchAIModels(urlDraft);
      setModels(list);
      if (list.length === 0) {
        notify("The AI server did not report any loaded models", "error");
      }
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not reach AI server",
        "error",
      );
    } finally {
      setModelsLoading(false);
    }
  }

  function saveAI() {
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeAIServerUrl(urlDraft);
    } catch {
      notify("Enter a valid AI server URL", "error");
      return;
    }
    const endpoint = new URL(normalizedUrl);
    const local = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" || endpoint.hostname === "[::1]";
    if ((!local || endpoint.protocol !== "http:") && endpoint.protocol !== "https:") {
      notify("Remote AI endpoints must use HTTPS", "error");
      return;
    }
    if (!local && !window.confirm("This AI endpoint can receive email, calendar, notes, tasks, and conversation context. Save it anyway?")) return;
    setUrlDraft(normalizedUrl);
    dispatch({ type: "SET_AI_SERVER_URL", url: normalizedUrl });
    dispatch({ type: "SET_ASSISTANT_MODEL", model: modelDraft });
    setShowAssistantDropdown(false);
    notify("AI settings saved", "success");
  }

  return (
    <>
      <SettingRow
        label="API base URL"
        description="OpenAI-compatible API including /v1. Enabled feature context may be sent to this endpoint; remote endpoints should be trusted and use HTTPS."
      >
        <input
          className="settings-input"
          value={urlDraft}
          onChange={(e) => {
            setUrlDraft(e.target.value);
            setModels([]);
            setShowAssistantDropdown(false);
          }}
          placeholder="http://127.0.0.1:8080/v1"
        />
      </SettingRow>

      {/* Model picker */}
      <SettingRow
        label="Model"
        description="Model used for all AI features. Leave blank to use the first model reported by the server."
      >
        <div className="flex gap-2">
          <input
            className="settings-input flex-1"
            value={modelDraft}
            onChange={(e) => {
              setModelDraft(e.target.value);
              setShowAssistantDropdown(false);
            }}
            placeholder="Default (server picks)"
          />
          <button
            onClick={async () => {
              if (models.length === 0) await loadModels();
              setShowAssistantDropdown((v) => !v);
            }}
            disabled={modelsLoading}
            className="flex items-center gap-1.5 text-sm text-accent border border-border-2 rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50 px-3"
          >
            <ChevronDown
              size={14}
              className={modelsLoading ? "animate-spin" : ""}
            />{" "}
            Browse
          </button>
        </div>
        {showAssistantDropdown && models.length > 0 && (
          <ModelDropdown
            models={models}
            currentValue={modelDraft}
            label="model"
            onSelect={(v) => {
              setModelDraft(v);
              setShowAssistantDropdown(false);
            }}
          />
        )}
      </SettingRow>

      <button
        onClick={saveAI}
        className="w-full py-2.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
      >
        <Check size={14} /> Save AI settings
      </button>
    </>
  );
}

function ModelDropdown({
  models,
  currentValue,
  label,
  onSelect,
}: {
  models: ModelOption[];
  currentValue: string;
  label: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="max-h-48 overflow-y-auto bg-surface-2 border border-border-2 rounded-lg shadow-xl mt-1">
      <div className="px-3 py-1.5 text-xs text-text-3 uppercase tracking-wider border-b border-border sticky top-0 bg-surface-2">
        Select for {label}
      </div>
      <button
        onClick={() => onSelect("")}
        className="w-full text-left px-3 py-2 text-sm text-text-2 hover:bg-surface border-b border-border/50"
      >
        Default (server picks)
      </button>
      {models.map((m) => {
        const val = m.id;
        return (
          <button
            key={val}
            onClick={() => onSelect(val)}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-surface flex items-center gap-2 ${currentValue === val ? "text-accent" : "text-text"}`}
          >
            {currentValue === val && (
              <Check size={12} className="flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="truncate">{m.label}</div>
              <div className="text-xs text-text-3 truncate">{m.id}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
