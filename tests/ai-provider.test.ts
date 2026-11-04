import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_GEMINI_MODEL,
  REQUEST_TIMEOUT_MS,
  TEMPERATURE,
  resolveGeminiModel,
} from '@/lib/ai/config';
import { ProviderError, type ProviderErrorKind } from '@/lib/ai/provider';
import {
  GeminiProvider,
  type GeminiClientLike,
  type GeminiGenerateContentRequest,
  type GeminiGenerateContentResponse,
} from '@/lib/ai/providers/gemini';
import { FakeProvider } from '@/lib/ai/providers/fake';

const SampleSchema = z.object({
  title: z.string(),
  years: z.number(),
});

const SYSTEM_PROMPT = 'Extract structured role title and years of experience.';
const PROMPT_SENTINEL = 'SECRET_CANDIDATE_RESUME_TEXT_DO_NOT_LOG_98765';
const API_KEY_SENTINEL = 'AIzaSy_SECRET_KEY_SENTINEL_999';

async function expectProviderError(
  promise: Promise<unknown>,
  expected: {
    kind: ProviderErrorKind;
    provider: 'gemini' | 'fake';
    status?: number;
  },
): Promise<ProviderError> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ProviderError);
  const providerErr = caught as ProviderError;
  expect(providerErr.kind).toBe(expected.kind);
  expect(providerErr.provider).toBe(expected.provider);
  expect(providerErr.status).toBe(expected.status);
  return providerErr;
}

describe('T-015 LLM Provider Seam', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('resolveGeminiModel', () => {
    it('returns DEFAULT_GEMINI_MODEL when GEMINI_MODEL_FAST is undefined', () => {
      expect(resolveGeminiModel({})).toBe(DEFAULT_GEMINI_MODEL);
      expect(resolveGeminiModel({})).toBe('gemini-3.5-flash-lite');
    });

    it('returns the custom model when GEMINI_MODEL_FAST is set', () => {
      expect(
        resolveGeminiModel({ GEMINI_MODEL_FAST: 'gemini-2.5-flash-preview' }),
      ).toBe('gemini-2.5-flash-preview');
    });

    it('falls back to DEFAULT_GEMINI_MODEL when GEMINI_MODEL_FAST is blank or whitespace', () => {
      expect(resolveGeminiModel({ GEMINI_MODEL_FAST: '' })).toBe(
        DEFAULT_GEMINI_MODEL,
      );
      expect(resolveGeminiModel({ GEMINI_MODEL_FAST: '   ' })).toBe(
        DEFAULT_GEMINI_MODEL,
      );
    });
  });

  describe('GeminiProvider construction and key handling', () => {
    it('does not throw when constructed with a valid key and mock client', () => {
      const client: GeminiClientLike = {
        generateContent: vi.fn(),
      };
      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        client,
      });
      expect(provider.name).toBe('gemini');
    });

    it('accepts GEMINI_API_KEY from env option when apiKey option is omitted', () => {
      const client: GeminiClientLike = {
        generateContent: vi.fn(),
      };
      const provider = new GeminiProvider({
        env: { GEMINI_API_KEY: API_KEY_SENTINEL },
        client,
      });
      expect(provider.name).toBe('gemini');
    });

    it('prefers apiKey option over env.GEMINI_API_KEY when both are provided', () => {
      const client: GeminiClientLike = {
        generateContent: vi.fn(),
      };
      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: { GEMINI_API_KEY: '' },
        client,
      });
      expect(provider.name).toBe('gemini');
    });

    it('throws an error naming GEMINI_API_KEY when key is missing from env option', () => {
      const client: GeminiClientLike = {
        generateContent: vi.fn(),
      };
      expect(() => new GeminiProvider({ env: {}, client })).toThrow(
        /GEMINI_API_KEY/,
      );
    });

    it('throws an error naming GEMINI_API_KEY when key is an empty or whitespace string', () => {
      const client: GeminiClientLike = {
        generateContent: vi.fn(),
      };
      expect(() => new GeminiProvider({ apiKey: '', client })).toThrow(
        /GEMINI_API_KEY/,
      );
      expect(
        () => new GeminiProvider({ env: { GEMINI_API_KEY: '   ' }, client }),
      ).toThrow(/GEMINI_API_KEY/);
    });
  });

  describe('GeminiProvider request contract & valid responses', () => {
    it('passes systemInstruction and contents in separate fields, never puts prompt in systemInstruction, and passes token counts through', async () => {
      let capturedRequest: GeminiGenerateContentRequest | undefined;
      const generateContent = vi.fn(
        async (
          req: GeminiGenerateContentRequest,
        ): Promise<GeminiGenerateContentResponse> => {
          capturedRequest = req;
          return {
            text: JSON.stringify({ title: 'Staff Engineer', years: 8 }),
            inputTokens: 42,
            outputTokens: 12,
          };
        },
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      const result = await provider.generateStructured({
        systemPrompt: SYSTEM_PROMPT,
        prompt: PROMPT_SENTINEL,
        schema: SampleSchema,
      });

      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(capturedRequest).toBeDefined();
      expect(capturedRequest!.systemInstruction).toBe(SYSTEM_PROMPT);
      expect(capturedRequest!.contents).toBe(PROMPT_SENTINEL);
      expect(capturedRequest!.systemInstruction).not.toContain(PROMPT_SENTINEL);
      expect(capturedRequest!.temperature).toBe(TEMPERATURE);
      expect(capturedRequest!.temperature).toBe(0);
      expect(result.inputTokens).toBe(42);
      expect(result.outputTokens).toBe(12);
    });

    it('passes responseJsonSchema as an object containing title and years properties', async () => {
      let capturedRequest: GeminiGenerateContentRequest | undefined;
      const generateContent = vi.fn(
        async (
          req: GeminiGenerateContentRequest,
        ): Promise<GeminiGenerateContentResponse> => {
          capturedRequest = req;
          return {
            text: JSON.stringify({ title: 'Backend Engineer', years: 5 }),
          };
        },
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      await provider.generateStructured({
        systemPrompt: SYSTEM_PROMPT,
        prompt: PROMPT_SENTINEL,
        schema: SampleSchema,
      });

      expect(capturedRequest?.responseJsonSchema).toBeTypeOf('object');
      expect(capturedRequest?.responseJsonSchema).not.toBeNull();
      const schemaObj = capturedRequest!.responseJsonSchema as {
        properties?: Record<string, unknown>;
      };
      expect(schemaObj.properties).toBeDefined();
      expect(schemaObj.properties).toHaveProperty('title');
      expect(schemaObj.properties).toHaveProperty('years');
    });

    it('returns validated data, provider gemini, matching model, measured latencyMs >= 50, and undefined tokens when omitted by client', async () => {
      vi.useFakeTimers();

      let capturedRequest: GeminiGenerateContentRequest | undefined;
      const generateContent = vi.fn(
        async (
          req: GeminiGenerateContentRequest,
        ): Promise<GeminiGenerateContentResponse> => {
          capturedRequest = req;
          await vi.advanceTimersByTimeAsync(50);
          return {
            text: JSON.stringify({ title: 'Platform Engineer', years: 6 }),
          };
        },
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: { GEMINI_MODEL_FAST: 'gemini-custom-fast' },
        client: { generateContent },
      });

      const result = await provider.generateStructured({
        systemPrompt: SYSTEM_PROMPT,
        prompt: PROMPT_SENTINEL,
        schema: SampleSchema,
      });

      expect(result.data).toEqual({ title: 'Platform Engineer', years: 6 });
      expect(result.provider).toBe('gemini');
      expect(result.model).toBe('gemini-custom-fast');
      expect(result.model).toBe(capturedRequest!.model);
      expect(result.latencyMs).toBeGreaterThanOrEqual(50);
      expect(result.inputTokens).toBeUndefined();
      expect(result.outputTokens).toBeUndefined();
    });

    it('prefers options.model over env.GEMINI_MODEL_FAST', async () => {
      let capturedRequest: GeminiGenerateContentRequest | undefined;
      const generateContent = vi.fn(
        async (
          req: GeminiGenerateContentRequest,
        ): Promise<GeminiGenerateContentResponse> => {
          capturedRequest = req;
          return {
            text: JSON.stringify({ title: 'SRE', years: 4 }),
          };
        },
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        model: 'gemini-explicit-override',
        env: { GEMINI_MODEL_FAST: 'gemini-env-override' },
        client: { generateContent },
      });

      const result = await provider.generateStructured({
        systemPrompt: SYSTEM_PROMPT,
        prompt: PROMPT_SENTINEL,
        schema: SampleSchema,
      });

      expect(capturedRequest?.model).toBe('gemini-explicit-override');
      expect(result.model).toBe('gemini-explicit-override');
    });

    it('never calls globalThis.fetch during successful execution', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const generateContent = vi.fn(
        async (): Promise<GeminiGenerateContentResponse> => ({
          text: JSON.stringify({ title: 'Security Engineer', years: 7 }),
        }),
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      const result = await provider.generateStructured({
        systemPrompt: SYSTEM_PROMPT,
        prompt: PROMPT_SENTINEL,
        schema: SampleSchema,
      });

      expect(result.data).toEqual({ title: 'Security Engineer', years: 7 });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('GeminiProvider error handling & non-retry / non-repair rules', () => {
    it('throws ProviderError with kind api and preserves HTTP status when client rejects with status', async () => {
      const apiErr = Object.assign(new Error('Quota exceeded'), {
        status: 429,
      });
      const generateContent = vi.fn(async () => {
        throw apiErr;
      });

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      await expectProviderError(
        provider.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
        }),
        { kind: 'api', provider: 'gemini', status: 429 },
      );

      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('throws ProviderError with kind api and status undefined on network error without status', async () => {
      const netErr = new Error('fetch failed: ECONNRESET');
      const generateContent = vi.fn(async () => {
        throw netErr;
      });

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      await expectProviderError(
        provider.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
        }),
        { kind: 'api', provider: 'gemini', status: undefined },
      );

      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('throws ProviderError with kind timeout and aborts client signal when REQUEST_TIMEOUT_MS elapses', async () => {
      vi.useFakeTimers();

      let capturedSignal: AbortSignal | undefined;
      const generateContent = vi.fn(
        (
          req: GeminiGenerateContentRequest,
        ): Promise<GeminiGenerateContentResponse> => {
          capturedSignal = req.abortSignal;
          return new Promise<GeminiGenerateContentResponse>(
            (_resolve, reject) => {
              req.abortSignal?.addEventListener('abort', () => {
                const abortErr = new Error('The operation was aborted');
                abortErr.name = 'AbortError';
                reject(abortErr);
              });
            },
          );
        },
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      const pending = expectProviderError(
        provider.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
        }),
        { kind: 'timeout', provider: 'gemini', status: undefined },
      );

      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await pending;

      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal!.aborted).toBe(true);
    });

    it('throws ProviderError with kind timeout when caller abortSignal aborts in flight', async () => {
      const callerController = new AbortController();
      let capturedSignal: AbortSignal | undefined;

      const generateContent = vi.fn(
        (
          req: GeminiGenerateContentRequest,
        ): Promise<GeminiGenerateContentResponse> => {
          capturedSignal = req.abortSignal;
          return new Promise<GeminiGenerateContentResponse>(
            (_resolve, reject) => {
              req.abortSignal?.addEventListener('abort', () => {
                const abortErr = new Error('Caller aborted');
                abortErr.name = 'AbortError';
                reject(abortErr);
              });
            },
          );
        },
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      const pending = expectProviderError(
        provider.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
          abortSignal: callerController.signal,
        }),
        { kind: 'timeout', provider: 'gemini', status: undefined },
      );

      callerController.abort();
      await pending;

      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(capturedSignal?.aborted).toBe(true);
    });

    it('throws ProviderError with kind timeout when caller abortSignal is pre-aborted before call', async () => {
      const callerController = new AbortController();
      callerController.abort();

      const generateContent = vi.fn(
        async (
          req: GeminiGenerateContentRequest,
        ): Promise<GeminiGenerateContentResponse> => {
          if (req.abortSignal?.aborted) {
            const abortErr = new Error('Signal already aborted');
            abortErr.name = 'AbortError';
            throw abortErr;
          }
          return { text: JSON.stringify({ title: 'Engineer', years: 1 }) };
        },
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      await expectProviderError(
        provider.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
          abortSignal: callerController.signal,
        }),
        { kind: 'timeout', provider: 'gemini', status: undefined },
      );

      expect(generateContent).toHaveBeenCalledTimes(0);
    });

    it.each([
      { label: 'null', text: null },
      { label: 'undefined', text: undefined },
      { label: 'empty string', text: '' },
      { label: 'whitespace', text: '   \n\t  ' },
    ])(
      'throws ProviderError with kind empty_response when text is $label',
      async ({ text }) => {
        const generateContent = vi.fn(
          async (): Promise<GeminiGenerateContentResponse> => ({
            text,
          }),
        );

        const provider = new GeminiProvider({
          apiKey: API_KEY_SENTINEL,
          env: {},
          client: { generateContent },
        });

        await expectProviderError(
          provider.generateStructured({
            systemPrompt: SYSTEM_PROMPT,
            prompt: PROMPT_SENTINEL,
            schema: SampleSchema,
          }),
          { kind: 'empty_response', provider: 'gemini', status: undefined },
        );

        expect(generateContent).toHaveBeenCalledTimes(1);
      },
    );

    it('throws ProviderError with kind schema_validation on mismatching payload and never includes prompt sentinel in error message or cause', async () => {
      const generateContent = vi.fn(
        async (): Promise<GeminiGenerateContentResponse> => ({
          text: JSON.stringify({
            title: PROMPT_SENTINEL,
            years: 'not-a-number',
          }),
        }),
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      const err = await expectProviderError(
        provider.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
        }),
        { kind: 'schema_validation', provider: 'gemini', status: undefined },
      );

      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(err.message).not.toContain(PROMPT_SENTINEL);
      expect(JSON.stringify(err.cause ?? '')).not.toContain(PROMPT_SENTINEL);
      expect(String(err.cause ?? '')).not.toContain(PROMPT_SENTINEL);
    });

    it('does not repair markdown-fenced JSON even when inner payload is valid', async () => {
      const generateContent = vi.fn(
        async (): Promise<GeminiGenerateContentResponse> => ({
          text: '```json\n{"title":"Engineer","years":5}\n```',
        }),
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      await expectProviderError(
        provider.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
        }),
        { kind: 'schema_validation', provider: 'gemini', status: undefined },
      );

      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('does not coerce or repair unfenced JSON with wrong field type (numeric string)', async () => {
      const generateContent = vi.fn(
        async (): Promise<GeminiGenerateContentResponse> => ({
          text: '{"title":"Engineer","years":"5"}',
        }),
      );

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      await expectProviderError(
        provider.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
        }),
        { kind: 'schema_validation', provider: 'gemini', status: undefined },
      );

      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('never leaks prompt sentinel or API key sentinel to console logs, error message, or error cause', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const generateContent = vi.fn(async () => {
        throw new Error(`Upstream failed for key ${API_KEY_SENTINEL}`);
      });

      const provider = new GeminiProvider({
        apiKey: API_KEY_SENTINEL,
        env: {},
        client: { generateContent },
      });

      const err = await expectProviderError(
        provider.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
        }),
        { kind: 'api', provider: 'gemini', status: undefined },
      );

      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(err.message).not.toContain(API_KEY_SENTINEL);
      expect(err.message).not.toContain(PROMPT_SENTINEL);
      expect(JSON.stringify(err.cause ?? '')).not.toContain(API_KEY_SENTINEL);
      expect(String(err.cause ?? '')).not.toContain(API_KEY_SENTINEL);

      const allConsoleArgs = [
        ...logSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]
        .flat()
        .map((item) =>
          typeof item === 'string' ? item : JSON.stringify(item ?? ''),
        )
        .join(' ');

      expect(allConsoleArgs).not.toContain(PROMPT_SENTINEL);
      expect(allConsoleArgs).not.toContain(API_KEY_SENTINEL);
    });
  });

  describe('FakeProvider', () => {
    it('returns a validated canned response and never reads process.env', async () => {
      const envAccesses: string[] = [];
      process.env = new Proxy(originalEnv, {
        get(target, prop) {
          if (typeof prop === 'string') {
            envAccesses.push(prop);
          }
          return Reflect.get(target, prop);
        },
      });

      const fake = new FakeProvider({
        response: { title: 'Principal Engineer', years: 10 },
        latencyMs: 5,
        model: 'fake-model-v1',
      });

      const result = await fake.generateStructured({
        systemPrompt: SYSTEM_PROMPT,
        prompt: PROMPT_SENTINEL,
        schema: SampleSchema,
      });

      expect(fake.name).toBe('fake');
      expect(result.data).toEqual({ title: 'Principal Engineer', years: 10 });
      expect(result.provider).toBe('fake');
      expect(result.model).toBe('fake-model-v1');
      expect(result.latencyMs).toBe(5);
      expect(envAccesses).toEqual([]);
    });

    it('throws its configured ProviderError when error option is set', async () => {
      const configuredError = new ProviderError('Simulated rate limit', {
        kind: 'api',
        provider: 'fake',
        status: 429,
      });

      const fake = new FakeProvider({ error: configuredError });

      const caught = await expectProviderError(
        fake.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
        }),
        { kind: 'api', provider: 'fake', status: 429 },
      );

      expect(caught).toBe(configuredError);
    });

    it('throws ProviderError with kind schema_validation when canned response violates schema', async () => {
      const fake = new FakeProvider({
        response: { title: 'Engineer', years: 'not-a-number' },
      });

      await expectProviderError(
        fake.generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          prompt: PROMPT_SENTINEL,
          schema: SampleSchema,
        }),
        { kind: 'schema_validation', provider: 'fake', status: undefined },
      );
    });
  });
});
