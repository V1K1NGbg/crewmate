import { authorizeHome, privateJson } from "@/lib/home.server";
import { proxyAI, readBoundedJson, validateAIRequest } from "@crewmate/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  const denied = await authorizeHome(request);
  if (denied) return denied;
  if ((await context.params).path.join("/") !== "models") return privateJson({ error: "Unknown AI resource" }, 404);
  return proxyAI({ endpoint: process.env.CREWMATE_AI_URL, key: process.env.CREWMATE_AI_KEY, path: "models", signal: request.signal });
}

export async function POST(request: Request, context: Context) {
  const denied = await authorizeHome(request, true);
  if (denied) return denied;
  if ((await context.params).path.join("/") !== "chat/completions") return privateJson({ error: "Unknown AI action" }, 404);
  let body: ReturnType<typeof validateAIRequest>;
  try { body = validateAIRequest(await readBoundedJson(request, 1_048_576)); }
  catch (error) { return privateJson({ error: error instanceof Error ? error.message : "Invalid request" }, 400); }
  return proxyAI({ endpoint: process.env.CREWMATE_AI_URL, key: process.env.CREWMATE_AI_KEY, path: "chat/completions", body, signal: request.signal });
}
