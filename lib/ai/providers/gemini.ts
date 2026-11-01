import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import {
  REQUEST_TIMEOUT_MS,
  TEMPERATURE,
  resolveGeminiModel,
} from '@/lib/ai/config';
import {
  ProviderError,
  type GenerateParams,
  type GenerateResult,
  type LlmProvider,
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

function createDefaultGeminiClient(apiKey: string): GeminiClientLike {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generateContent(
      request: GeminiGenerateContentRequest,
    ): Promise<GeminiGenerateContentResponse> {
      const response = await ai.models.generateContent({
        model: request.model,
        contents: request.contents,
        config: {
          systemInstruction: request.systemInstruction,
          temperature: request.temperature,
          responseMimeType: 'application/json',
          responseJsonSchema: request.responseJsonSchema,
          abortSignal: request.abortSignal,
        },
      });
      return {
        text: response.text,
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      };
    },
  };
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;
  private readonly model: string;
  private readonly client: GeminiClientLike;

  constructor(options?: GeminiProviderOptions) {
    const env = options?.env ?? process.env;
    const rawKey =
      options?.apiKey !== undefined ? options.apiKey : env.GEMINI_API_KEY;
    const apiKey = rawKey?.trim();

    if (!apiKey) {
      throw new Error('Missing required environment variable: GEMINI_API_KEY');
    }

    const explicitModel = options?.model?.trim();
    this.model =
      explicitModel && explicitModel.length > 0
        ? explicitModel
        : resolveGeminiModel(env);
    this.client = options?.client ?? createDefaultGeminiClient(apiKey);
  }

  async generateStructured<T>(
    params: GenerateParams<T>,
  ): Promise<GenerateResult<T>> {
    if (params.abortSignal?.aborted) {
      throw new ProviderError('Gemini request aborted before dispatch', {
        kind: 'timeout',
        provider: 'gemini',
      });
    }

    const controller = new AbortController();
    let timedOutOrAborted = false;

    const onCallerAbort = () => {
      timedOutOrAborted = true;
      controller.abort();
    };

    params.abortSignal?.addEventListener('abort', onCallerAbort, {
      once: true,
    });

    const timeoutId = setTimeout(() => {
      timedOutOrAborted = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const startMs = Date.now();
    let response: GeminiGenerateContentResponse;

    try {
      const responseJsonSchema = z.toJSONSchema(params.schema);
      response = await this.client.generateContent({
        model: this.model,
        systemInstruction: params.systemPrompt,
        contents: params.prompt,
        temperature: TEMPERATURE,
        responseJsonSchema,
        abortSignal: controller.signal,
      });
    } catch (err: unknown) {
      const isAbortError =
        timedOutOrAborted ||
        controller.signal.aborted ||
        Boolean(params.abortSignal?.aborted) ||
        (err instanceof Error && err.name === 'AbortError');

      if (isAbortError) {
        throw new ProviderError('Gemini request timed out or was aborted', {
          kind: 'timeout',
          provider: 'gemini',
        });
      }

      const rawStatus =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;
      const status = typeof rawStatus === 'number' ? rawStatus : undefined;

      throw new ProviderError(
        status !== undefined
          ? `Gemini API error (status ${status})`
          : 'Gemini API request failed',
        {
          kind: 'api',
          provider: 'gemini',
          status,
        },
      );
    } finally {
      clearTimeout(timeoutId);
      params.abortSignal?.removeEventListener('abort', onCallerAbort);
    }

    const rawText = response.text;
    if (typeof rawText !== 'string' || rawText.trim().length === 0) {
      throw new ProviderError('Gemini returned an empty response', {
        kind: 'empty_response',
        provider: 'gemini',
      });
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(rawText);
    } catch {
      throw new ProviderError('Gemini response is not valid JSON', {
        kind: 'schema_validation',
        provider: 'gemini',
      });
    }

    const parsed = params.schema.safeParse(rawJson);
    if (!parsed.success) {
      const sanitizedIssues = parsed.error.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
      }));
      throw new ProviderError('Gemini response failed schema validation', {
        kind: 'schema_validation',
        provider: 'gemini',
        cause: { issues: sanitizedIssues },
      });
    }

    const latencyMs = Math.max(0, Date.now() - startMs);
    return {
      data: parsed.data,
      provider: 'gemini',
      model: this.model,
      latencyMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };
  }
}
