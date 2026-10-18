"use client";

import { useEffect, useState } from "react";
import { fetchAIModels, type AIModel } from "@crewmate/lib";
import { useApp } from "@crewmate/state";
import { buttonClass, Card, Page, ReadStatus } from "./ui";

export default function AIPage() {
  const { state, dispatch } = useApp();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ url: string; revision: number; models: AIModel[]; error: string | null } | null>(null);
  const url = state.aiServerUrl;
  const loading = !result || result.url !== url || result.revision !== revision;

  useEffect(() => {
    let active = true;
    fetchAIModels(url).then((models) => {
      if (active) setResult({ url, revision, models, error: null });
    }).catch((error: unknown) => {
      if (active) setResult({ url, revision, models: [], error: error instanceof Error ? error.message : "The AI service could not be reached." });
    });
    return () => { active = false; };
  }, [url, revision]);

  const error = !loading ? result?.error ?? null : null;
  return <Page title="AI" description="Model availability from the existing configured AI connection." refresh={() => setRevision((value) => value + 1)} loading={loading}>
    <ReadStatus loading={loading} error={error} />
    <Card title="Connection">
      <p className="break-all text-sm text-text-2">Configured endpoint: {url || "Default endpoint"}</p>
      <p role="status" className="mt-2 text-sm">{loading ? "Checking availability…" : error ? "Availability unknown: the check failed." : "Model endpoint responded."}</p>
      <p className="mt-2 text-sm text-text-2">A model listing does not prove GPU acceleration or generation readiness. The server administrator controls the local runtime and approved backend connection.</p>
    </Card>
    {!loading && !error && <Card title="Available models">{result?.models.length ? <ul className="flex flex-col gap-2 text-sm">{result.models.map((model) => <li key={model.id} className="break-all">{model.label}{model.id === state.assistantModel ? " — selected for assistant" : ""}</li>)}</ul> : <p className="text-sm text-text-2">The server returned no models. Load a model on the runtime, then refresh.</p>}</Card>}
    <button type="button" className={`${buttonClass} self-start`} onClick={() => dispatch({ type: "SET_AI_OVERLAY_OPEN", open: true })}>Open AI assistant</button>
    <p className="text-sm text-text-2">This integration grants the assistant no privileged host, VM, container, or VPN actions.</p>
  </Page>;
}
