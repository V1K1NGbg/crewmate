const DEFAULT_AI_SERVER_URL = "http://127.0.0.1:8080/v1";
const DETECT_TIMEOUT_MS = 2000;
const REQUEST_TIMEOUT_MS = 120000;

export interface AIModel {
  id: string;
  label: string;
}

type FetchImplementation = typeof fetch;

export function normalizeAIServerUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_AI_SERVER_URL;

  const parsed = new URL(trimmed);
  parsed.search = "";
  parsed.hash = "";
  const pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = pathname || "/v1";
  return parsed.toString().replace(/\/$/, "");
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchImplementation,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function responseError(response: Response): Promise<Error> {
  const detail = (await response.text()).trim().slice(0, 500);
  return new Error(
    `AI server request failed (${response.status})${detail ? `: ${detail}` : ""}`,
  );
}

export async function fetchAIModels(
  serverUrl: string,
  fetchImpl: FetchImplementation = fetch,
): Promise<AIModel[]> {
  const baseUrl = normalizeAIServerUrl(serverUrl);
  const response = await fetchWithTimeout(
    `${baseUrl}/models`,
    { headers: { Accept: "application/json" } },
    DETECT_TIMEOUT_MS,
    fetchImpl,
  );
  if (!response.ok) throw await responseError(response);

  const payload = (await response.json()) as {
    data?: Array<{ id?: unknown; name?: unknown }>;
  };
  return (payload.data ?? [])
    .filter((model): model is { id: string; name?: string } =>
      Boolean(model && typeof model.id === "string" && model.id),
    )
    .map((model) => ({
      id: model.id,
      label:
        typeof model.name === "string" && model.name ? model.name : model.id,
    }));
}

export async function detectAIServer(
  serverUrl: string,
  fetchImpl: FetchImplementation = fetch,
): Promise<boolean> {
  try {
    await fetchAIModels(serverUrl, fetchImpl);
    return true;
  } catch {
    return false;
  }
}

export async function aiChat(
  serverUrl: string,
  prompt: string,
  model?: string,
  fetchImpl: FetchImplementation = fetch,
): Promise<string> {
  const baseUrl = normalizeAIServerUrl(serverUrl);
  const selectedModel =
    model?.trim() || (await fetchAIModels(baseUrl, fetchImpl))[0]?.id;
  if (!selectedModel) {
    throw new Error(
      "The AI server did not report any models. Load a model and try again.",
    );
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    },
    REQUEST_TIMEOUT_MS,
    fetchImpl,
  );
  if (!response.ok) throw await responseError(response);

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The AI server returned an empty response.");
  }
  return content.trim();
}
