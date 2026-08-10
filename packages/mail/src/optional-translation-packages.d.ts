/** Type-only scaffold. These modules are intentionally not installed. */
declare module "eld/medium" {
  export const eld: {
    detect(text: string): { language: string };
  };
}

declare module "@huggingface/transformers" {
  type TranslationOutput = { translation_text: string };
  type TranslationPipeline = (
    text: string,
    options: { src_lang: string; tgt_lang: string },
  ) => Promise<TranslationOutput | TranslationOutput[]>;

  export function pipeline(
    task: "translation",
    model: string,
    options: {
      revision: string;
      dtype: string;
      progress_callback: (value: unknown) => void;
    },
  ): Promise<TranslationPipeline>;
}
