import type {
  LocalTranslationRequest,
  LocalTranslationWorkerMessage,
} from "./localTranslationProtocol";
import type { EmailTranslationResult } from "./translation";

type PendingTranslation = {
  resolve: (result: EmailTranslationResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number) => void;
};

/**
 * Disabled scaffold for a future package-backed, browser-local translator.
 * Do not import this client into GmailPage until the optional dependencies are
 * approved and installed; see AGENTS.md and docs/ARCHITECTURE.md.
 */
export class LocalTranslationClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingTranslation>();

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./localTranslation.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<LocalTranslationWorkerMessage>) => {
      const message = event.data;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      if (message.type === "progress") {
        pending.onProgress?.(message.progress);
        return;
      }
      this.pending.delete(message.id);
      if (message.type === "result") pending.resolve(message.result);
      else pending.reject(new Error(message.message));
    };
    worker.onerror = () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("The local translation worker failed"));
      }
      this.pending.clear();
    };
    this.worker = worker;
    return worker;
  }

  translate(
    text: string,
    targetLanguage: string,
    options: {
      allowModelDownload?: boolean;
      onProgress?: (progress: number) => void;
    } = {},
  ): Promise<EmailTranslationResult> {
    const id = this.nextId++;
    const request: LocalTranslationRequest = {
      id,
      text,
      targetLanguage,
      allowModelDownload: options.allowModelDownload ?? false,
    };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress: options.onProgress });
      this.getWorker().postMessage(request);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      pending.reject(new Error("The local translation worker was closed"));
    }
    this.pending.clear();
  }
}
