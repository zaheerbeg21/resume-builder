import type { z } from 'zod';

export type ProviderName = 'gemini' | 'fake';

export interface GenerateParams<T> {
  systemPrompt: string;
  prompt: string;
  schema: z.ZodType<T>;
  abortSignal?: AbortSignal;
}

export interface GenerateResult<T> {
  data: T;
  provider: ProviderName;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmProvider {
  readonly name: ProviderName;
  generateStructured<T>(params: GenerateParams<T>): Promise<GenerateResult<T>>;
}

export type ProviderErrorKind =
  | 'api'
  | 'timeout'
  | 'empty_response'
  | 'schema_validation';

export interface ProviderErrorInit {
  kind: ProviderErrorKind;
  provider: ProviderName;
  status?: number;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: ProviderName;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(message: string, init: ProviderErrorInit) {
    super(message);
    this.name = 'ProviderError';
    this.kind = init.kind;
    this.provider = init.provider;
    this.status = init.status;
    this.cause = init.cause;
  }
}

