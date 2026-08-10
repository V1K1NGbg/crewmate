import { pipeline } from "@huggingface/transformers";
import { eld } from "eld/medium";
import {
  LOCAL_TRANSLATION_MODEL,
  LOCAL_TRANSLATION_MODEL_REVISION,
  localTranslationChunks,
  type LocalTranslationRequest,
  type LocalTranslationWorkerMessage,
} from "./localTranslationProtocol";
import { languageName, translationResult } from "./translation";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LocalTranslationRequest>) => void) | null;
  postMessage(message: LocalTranslationWorkerMessage): void;
};

let translatorPromise: ReturnType<typeof createTranslator> | null = null;

function report(message: LocalTranslationWorkerMessage): void {
  scope.postMessage(message);
}

function progressValue(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const progress = (value as { progress?: unknown }).progress;
  return typeof progress === "number"
    ? Math.min(1, Math.max(0, progress > 1 ? progress / 100 : progress))
    : null;
}

function createTranslator(id: number) {
  return pipeline("translation", LOCAL_TRANSLATION_MODEL, {
    revision: LOCAL_TRANSLATION_MODEL_REVISION,
    dtype: "q8",
    progress_callback: (value: unknown) => {
      const progress = progressValue(value);
      if (progress !== null) report({ id, type: "progress", progress });
    },
  });
}

scope.onmessage = (event) => {
  void handleRequest(event.data);
};

async function handleRequest(request: LocalTranslationRequest): Promise<void> {
  try {
    const sourceLanguage = eld.detect(request.text.slice(0, 4000)).language;
    const targetLanguage = request.targetLanguage === "zh-Hant"
      ? "zh"
      : request.targetLanguage.split("-")[0];
    if (!sourceLanguage || sourceLanguage === "und") {
      report({
        id: request.id,
        type: "error",
        code: "UNSUPPORTED_LANGUAGE",
        message: "Could not determine the email language",
      });
      return;
    }
    if (sourceLanguage.split("-")[0] === targetLanguage) {
      report({
        id: request.id,
        type: "result",
        result: {
          sameLanguage: true,
          sourceLanguage: languageName(sourceLanguage),
          translation: "",
        },
      });
      return;
    }
    if (!translatorPromise && !request.allowModelDownload) {
      report({
        id: request.id,
        type: "error",
        code: "MODEL_DOWNLOAD_REQUIRED",
        message: "The local translation model must be downloaded first",
      });
      return;
    }

    translatorPromise ??= createTranslator(request.id);
    const translator = await translatorPromise;
    const translated: string[] = [];
    for (const chunk of localTranslationChunks(request.text.slice(0, 12_000))) {
      const output = await translator(chunk, {
        src_lang: sourceLanguage,
        tgt_lang: targetLanguage,
      });
      const first = Array.isArray(output) ? output[0] : output;
      if (!first?.translation_text) throw new Error("The translation model returned no text");
      translated.push(first.translation_text);
    }
    report({
      id: request.id,
      type: "result",
      result: translationResult(languageName(sourceLanguage), translated.join("\n")),
    });
  } catch (error: unknown) {
    translatorPromise = null;
    report({
      id: request.id,
      type: "error",
      code: "TRANSLATION_FAILED",
      message: error instanceof Error ? error.message : "Local translation failed",
    });
  }
}
