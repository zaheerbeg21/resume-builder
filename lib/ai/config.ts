export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const REQUEST_TIMEOUT_MS = 8_000; // starting value, tuned on corpus
export const TEMPERATURE = 0;

export function resolveGeminiModel(
  env: Record<string, string | undefined>,
): string {
  void env;
  throw new Error('not implemented');
}

