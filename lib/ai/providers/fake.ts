import type {
  GenerateParams,
  GenerateResult,
  LlmProvider,
  ProviderError,
} from '@/lib/ai/provider';

export interface FakeProviderOptions {
  response?: unknown;
  error?: ProviderError;
  latencyMs?: number;
  model?: string;
}

export class FakeProvider implements LlmProvider {
  readonly name = 'fake' as const;

  constructor(options?: FakeProviderOptions) {
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

