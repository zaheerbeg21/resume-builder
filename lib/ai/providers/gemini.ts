import type {
  GenerateParams,
  GenerateResult,
  LlmProvider,
} from '@/lib/ai/provider';

export interface GeminiGenerateContentRequest {
  model: string;
  systemInstruction: string;
  contents: string;
  temperature: number;
  responseJsonSchema?: unknown;
  abortSignal?: AbortSignal;
}

export interface GeminiGenerateContentResponse {
  text?: string | null;
  inputTokens?: number;
  outputTokens?: number;
}

export interface GeminiClientLike {
  generateContent(
    request: GeminiGenerateContentRequest,
  ): Promise<GeminiGenerateContentResponse>;
}

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
  env?: Record<string, string | undefined>;
  client?: GeminiClientLike;
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;

  constructor(options?: GeminiProviderOptions) {
    void options;
    throw new Error('not implemented');
  }

  async generateStructured<T>(
    params: GenerateParams<T>,
  ): Promise<GenerateResult<T>> {
    void params;
    throw new Error('not implemented');
  }
}

