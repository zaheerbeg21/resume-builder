export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';// 
export const REQUEST_TIMEOUT_MS = 15_000; // starting value, tuned on corpus
export const TEMPERATURE = 0;

export function resolveGeminiModel(
  env: Record<string, string | undefined>,
): string {
  const candidate = env.GEMINI_MODEL_FAST?.trim();
  return candidate && candidate.length > 0 ? candidate : DEFAULT_GEMINI_MODEL;
}
