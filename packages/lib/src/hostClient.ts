import { request } from "node:http";

/** This transport can reach only the operator-configured Unix socket. */
export function requestHost(socketPath: string, path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  if (!socketPath.startsWith("/")) throw new Error("Host socket must be an absolute path");
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = request({
      socketPath, path, method: payload ? "POST" : "GET", signal,
      headers: { Accept: "application/json", ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) },
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2_097_152) { req.destroy(new Error("Host response too large")); return; }
        chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => {
        try { resolve({ status: res.statusCode ?? 502, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch { reject(new Error("Invalid host response")); }
      });
    });
    const timeout = setTimeout(() => req.destroy(new Error("Host request timed out")), 35_000);
    req.on("close", () => clearTimeout(timeout));
    req.on("error", reject);
    req.end(payload);
  });
}
