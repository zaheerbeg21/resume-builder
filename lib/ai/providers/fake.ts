import {
  ProviderError,
  type GenerateParams,
  type GenerateResult,
  type LlmProvider,
} from '@/lib/ai/provider';

export interface FakeProviderOptions {
  response?: unknown;
  error?: ProviderError;
  latencyMs?: number;
  model?: string;
}

export class FakeProvider implements LlmProvider {
  readonly name = 'fake' as const;
  private readonly options: FakeProviderOptions;

  constructor(options: FakeProviderOptions = {}) {
    this.options = options;
  }

  async generateStructured<T>(
    params: GenerateParams<T>,
  ): Promise<GenerateResult<T>> {
    if (this.options.error) {
      throw this.options.error;
    }

    const parsed = params.schema.safeParse(this.options.response);
    if (!parsed.success) {
      const sanitizedIssues = parsed.error.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
      }));
      throw new ProviderError(
        'Fake provider response failed schema validation',
        {
          kind: 'schema_validation',
          provider: 'fake',
          cause: { issues: sanitizedIssues },
        },
      );
    }

    return {
      data: parsed.data,
      provider: 'fake',
      model: this.options.model ?? 'fake',
      latencyMs: this.options.latencyMs ?? 0,
    };
  }
}
