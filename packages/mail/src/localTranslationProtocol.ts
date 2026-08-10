import type { EmailTranslationResult } from "./translation";

export const LOCAL_TRANSLATION_MODEL = "Xenova/m2m100_418M";
export const LOCAL_TRANSLATION_MODEL_REVISION = "9c374f0";

export type LocalTranslationRequest = {
  id: number;
  text: string;
  targetLanguage: string;
  allowModelDownload: boolean;
};

export type LocalTranslationWorkerMessage =
  | { id: number; type: "progress"; progress: number }
  | { id: number; type: "result"; result: EmailTranslationResult }
  | {
      id: number;
      type: "error";
      code: "MODEL_DOWNLOAD_REQUIRED" | "UNSUPPORTED_LANGUAGE" | "TRANSLATION_FAILED";
      message: string;
    };

export function localTranslationChunks(text: string, maximum = 600): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maximum) {
    chunks.push(text.slice(index, index + maximum));
  }
  return chunks;
}
