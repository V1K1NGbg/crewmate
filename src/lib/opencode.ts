const DEFAULT_PORTS = [4096, 4097, 4098, 3000];
const DETECT_TIMEOUT_MS = 2000;
const REQUEST_TIMEOUT_MS = 60000;

export async function detectOpencodeServer(
  baseUrl?: string,
): Promise<string | null> {
  if (baseUrl) return (await pingServer(baseUrl)) ? baseUrl : null;
  for (const port of DEFAULT_PORTS) {
    const url = `http://localhost:${port}`;
    if (await pingServer(url)) return url;
  }
  return null;
}

async function pingServer(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);
    const res = await fetch(`${url}/api/app`, {
      signal: controller.signal,
      mode: "no-cors",
    });
    clearTimeout(timeout);
    return res.ok || res.type === "opaque";
  } catch {
    return false;
  }
}

export interface OpencodeModel {
  providerId: string;
  modelId: string;
  label: string;
}

export async function fetchOpencodeModels(
  serverUrl: string,
): Promise<OpencodeModel[]> {
  try {
    const res = await fetch(`${serverUrl}/provider`);
    if (!res.ok) return [];
    const data = await res.json();
    const connected: string[] = data.connected ?? [];
    const providers: Array<{
      id: string;
      name: string;
      models?: Record<string, { id: string; name?: string }>;
    }> = (data.all ?? []).filter((p: { id: string }) =>
      connected.includes(p.id),
    );
    const out: OpencodeModel[] = [];
    for (const provider of providers) {
      for (const model of Object.values(provider.models ?? {})) {
        out.push({
          providerId: provider.id,
          modelId: model.id,
          label: `${provider.name} / ${model.name ?? model.id}`,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Send a chat message to the opencode server.
 * Creates an ephemeral session, sends the message, then deletes the session.
 */
export async function opencodeChat(
  serverUrl: string,
  prompt: string,
  model?: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const sessionRes = await fetch(`${serverUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "crewmate-ai" }),
      signal: controller.signal,
    });
    if (!sessionRes.ok)
      throw new Error(`Failed to create session: ${sessionRes.status}`);
    const session = await sessionRes.json();
    const sessionId: string = session.id;
    try {
      const msgBody: Record<string, unknown> = {
        parts: [{ type: "text", text: prompt }],
      };
      if (model) {
        const slashIdx = model.indexOf("/");
        if (slashIdx !== -1) {
          msgBody.providerID = model.slice(0, slashIdx);
          msgBody.modelID = model.slice(slashIdx + 1);
        } else {
          msgBody.modelID = model;
        }
      }
      const msgRes = await fetch(`${serverUrl}/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msgBody),
        signal: controller.signal,
      });
      if (!msgRes.ok)
        throw new Error(`Failed to send message: ${msgRes.status}`);
      const msgData = await msgRes.json();
      const parts: Array<{ type: string; text?: string }> =
        msgData?.parts ?? [];
      const text = parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n")
        .trim();
      if (!text) throw new Error("Empty response from AI");
      return text;
    } finally {
      fetch(`${serverUrl}/session/${sessionId}`, { method: "DELETE" }).catch(
        () => {},
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
