const DEFAULT_AI_SERVER_URL = "http://127.0.0.1:8080/v1";
const DETECT_TIMEOUT_MS = 2000;
const REQUEST_TIMEOUT_MS = 120000;

export interface AIModel {
  id: string;
  label: string;
}

type FetchImplementation = typeof fetch;

function extractChatContent(raw: string): string | undefined {
  try {
    const payload = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : undefined;
  } catch {
    // Some local OpenAI-compatible servers occasionally truncate only the
    // closing tokens of the response envelope. The completed content string
    // is still usable, so recover it without accepting a truncated string.
    const contentKey = /"content"\s*:\s*/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = contentKey.exec(raw))) {
      const quoteStart = keyMatch.index + keyMatch[0].length;
      if (raw[quoteStart] !== '"') continue;

      let escaped = false;
      for (let i = quoteStart + 1; i < raw.length; i += 1) {
        const char = raw[i];
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          try {
            const content = JSON.parse(raw.slice(quoteStart, i + 1));
            if (typeof content === "string") return content;
          } catch {
            break;
          }
        }
      }
    }
    return undefined;
  }
}

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
  const externalSignal = init.signal;
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else
    externalSignal?.addEventListener("abort", abortFromExternalSignal, {
      once: true,
    });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
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
  signal?: AbortSignal,
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
      signal,
    },
    REQUEST_TIMEOUT_MS,
    fetchImpl,
  );
  if (!response.ok) throw await responseError(response);

  const raw = await response.text();
  const content = extractChatContent(raw);
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The AI server returned an incomplete response. Try again.");
  }
  return content.trim();
}
