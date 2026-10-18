import { authorizeHome, privateJson } from "@/lib/home.server";
import { OPERATION_ID, privateServiceOrigin, readBoundedJson, requestHost, validateHomeMutation } from "@crewmate/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string }> };

export async function GET(request: Request, context: Context) {
  const denied = await authorizeHome(request);
  if (denied) return denied;
  const { resource } = await context.params;
  if (resource === "services") {
    try {
      return privateJson({
        photosUrl: privateServiceOrigin(process.env.CREWMATE_PHOTOS_URL),
        containersUrl: privateServiceOrigin(process.env.CREWMATE_CONTAINERS_URL),
        identityUrl: privateServiceOrigin(process.env.CREWMATE_IDENTITY_URL),
        googleDeferred: true,
      });
    } catch { return privateJson({ error: "Service origins need valid server configuration" }, 503); }
  }
  if (!["overview", "vms", "vpn", "operations"].includes(resource)) return privateJson({ error: "Unknown resource" }, 404);
  let path = `/${resource}`;
  if (resource === "operations") {
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !OPERATION_ID.test(id)) return privateJson({ error: "Invalid operation ID" }, 400);
    path += `?id=${encodeURIComponent(id)}`;
  }
  try {
    const response = await requestHost(process.env.CREWMATE_HOST_SOCKET ?? "/run/crewmate-host/manager.sock", path, undefined, request.signal);
    return privateJson(response.body, response.status);
  } catch { return privateJson({ error: "Host manager is unavailable. Check its local service and socket permissions." }, 503); }
}

export async function POST(request: Request, context: Context) {
  const denied = await authorizeHome(request, true);
  if (denied) return denied;
  const { resource } = await context.params;
  if (!["vms", "vpn"].includes(resource)) return privateJson({ error: "Unknown action" }, 404);
  let body: Record<string, unknown>;
  try { body = validateHomeMutation(resource, await readBoundedJson(request)); }
  catch (error) { return privateJson({ error: error instanceof Error ? error.message : "Invalid request" }, 400); }
  try {
    const response = await requestHost(process.env.CREWMATE_HOST_SOCKET ?? "/run/crewmate-host/manager.sock", `/${resource}`, body, request.signal);
    return privateJson(response.body, response.status);
  } catch {
    // The host may have committed the operation before the connection was lost.
    return privateJson({ operationId: body.operationId, status: "uncertain", message: "Connection lost. Refresh the operation status before taking any further action." }, 202);
  }
}
