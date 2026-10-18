export function validateAIRequest(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a JSON object");
  const value = input as Record<string, unknown>;
  if (typeof value.model !== "string" || !value.model.trim() || value.model.length > 256) throw new Error("Invalid model");
  if (!Array.isArray(value.messages) || !value.messages.length || value.messages.length > 100) throw new Error("Invalid messages");
  let length = 0;
  const messages = value.messages.map((message: unknown) => {
    if (!message || typeof message !== "object") throw new Error("Invalid message");
    const item = message as Record<string, unknown>;
    if (!["system", "user", "assistant"].includes(String(item.role)) || typeof item.content !== "string") throw new Error("Only text chat messages are supported");
    length += item.content.length;
    if (length > 524_288) throw new Error("Messages are too large");
    return { role: item.role as string, content: item.content };
  });
  if (value.stream !== undefined && typeof value.stream !== "boolean") throw new Error("Invalid streaming option");
  if (value.max_tokens !== undefined && (!Number.isInteger(value.max_tokens) || Number(value.max_tokens) < 1 || Number(value.max_tokens) > 8192)) throw new Error("Invalid generation limit");
  if (value.temperature !== undefined && (typeof value.temperature !== "number" || !Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2)) throw new Error("Invalid temperature");
  return { model: value.model, messages, stream: value.stream === true,
    ...(value.max_tokens !== undefined ? { max_tokens: value.max_tokens } : {}),
    ...(value.temperature !== undefined ? { temperature: value.temperature } : {}) };
}

let generating = false;
const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function failure(error: string, status: number) { return Response.json({ error }, { status, headers: responseHeaders }); }

/** Fixed server destination, bounded concurrency, and cancellation through streamed responses. */
export async function proxyAI(options: {
  endpoint: string | undefined;
  key?: string;
  path: "models" | "chat/completions";
  body?: ReturnType<typeof validateAIRequest>;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const generation = options.path === "chat/completions";
  if (!options.endpoint) return failure("The local AI runtime is not configured", 503);
  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error();
  } catch { return failure("Invalid server AI configuration", 503); }
  if (generation && generating) return failure("The local model is busy. Try again when the current request finishes.", 429);
  if (generation) generating = true;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, generation ? 120_000 : 5_000);
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) abort();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timeout);
    options.signal.removeEventListener("abort", abort);
    if (generation) generating = false;
  };
  controller.signal.addEventListener("abort", release, { once: true });
  try {
    const response = await (options.fetchImpl ?? fetch)(`${endpoint.toString().replace(/\/$/, "")}/${options.path}`, {
      method: generation ? "POST" : "GET", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: { Accept: options.body?.stream ? "text/event-stream" : "application/json", ...(generation ? { "Content-Type": "application/json" } : {}), ...(options.key ? { Authorization: `Bearer ${options.key}` } : {}) },
      ...(generation ? { body: JSON.stringify(options.body) } : {}),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      release();
      return failure(`Local AI runtime is unavailable (${response.status})`, response.status === 429 ? 429 : 502);
    }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(stream) {
        try {
          const { done, value } = await reader.read();
          if (done) { release(); stream.close(); }
          else stream.enqueue(value);
        } catch (error) { release(); stream.error(error); }
      },
      async cancel() { controller.abort(); release(); await reader.cancel(); },
    });
    return new Response(body, { headers: { ...responseHeaders, "Content-Type": options.body?.stream ? "text/event-stream" : "application/json", "X-Accel-Buffering": "no" } });
  } catch {
    release();
    return failure(controller.signal.aborted ? "AI request cancelled or timed out" : "Could not reach the local AI runtime", controller.signal.aborted ? 504 : 502);
  }
}
