import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

export const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, { message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required' }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, { message: 'SUPABASE_SERVICE_ROLE_KEY is required' }),
  GEMINI_API_KEY: z.string().min(1, { message: 'GEMINI_API_KEY is required' }),
  GEMINI_MODEL_FAST: z.string().min(1, { message: 'GEMINI_MODEL_FAST is required' }),
  GEMINI_MODEL_QUALITY: z.string().min(1, { message: 'GEMINI_MODEL_QUALITY is required' }),
  STRIPE_SECRET_KEY: z.string().min(1, { message: 'STRIPE_SECRET_KEY is required' }),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, { message: 'STRIPE_WEBHOOK_SECRET is required' }),
  NEXT_PUBLIC_APP_URL: z.url({ message: 'NEXT_PUBLIC_APP_URL must be a valid URL' }),
});

export type Env = z.infer<typeof EnvSchema>;

const validConfig = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key-12345',
  SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key-secret',
  GEMINI_API_KEY: 'mock-gemini-api-key',
  GEMINI_MODEL_FAST: 'gemini-2.0-flash',
  GEMINI_MODEL_QUALITY: 'gemini-1.5-pro',
  STRIPE_SECRET_KEY: 'sk_test_mock_stripe_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_mock_stripe_webhook_secret',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};

describe('Environment Parser & Schema (T-002)', () => {
  it('parses valid environment configurations cleanly', () => {
    const result = EnvSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
      expect(result.data.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
      expect(result.data.GEMINI_MODEL_FAST).toBe('gemini-2.0-flash');
      expect(result.data.GEMINI_MODEL_QUALITY).toBe('gemini-1.5-pro');
    }
  });

  it('fails with descriptive error when an empty object is passed', () => {
    const result = EnvSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const errorPaths = result.error.issues.map((i) => i.path.join('.'));
      expect(errorPaths).toContain('NEXT_PUBLIC_SUPABASE_URL');
      expect(errorPaths).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      expect(errorPaths).toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(errorPaths).toContain('GEMINI_API_KEY');
      expect(errorPaths).toContain('GEMINI_MODEL_FAST');
      expect(errorPaths).toContain('GEMINI_MODEL_QUALITY');
      expect(errorPaths).toContain('STRIPE_SECRET_KEY');
      expect(errorPaths).toContain('STRIPE_WEBHOOK_SECRET');
      expect(errorPaths).toContain('NEXT_PUBLIC_APP_URL');
    }
  });

  const requiredKeys: (keyof typeof validConfig)[] = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY',
    'GEMINI_MODEL_FAST',
    'GEMINI_MODEL_QUALITY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_APP_URL',
  ];

  requiredKeys.forEach((key) => {
    it(`fails when ${key} is missing`, () => {
      const testConfig = { ...validConfig };
      delete testConfig[key];

      const result = EnvSchema.safeParse(testConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain(key);
      }
    });

    it(`fails when ${key} is empty string`, () => {
      const testConfig = { ...validConfig, [key]: '' };
      const result = EnvSchema.safeParse(testConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain(key);
      }
    });
  });

  it('fails when NEXT_PUBLIC_SUPABASE_URL is not a valid URL', () => {
    const testConfig = { ...validConfig, NEXT_PUBLIC_SUPABASE_URL: 'not-a-valid-url' };
    const result = EnvSchema.safeParse(testConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('NEXT_PUBLIC_SUPABASE_URL'));
      expect(issue).toBeDefined();
    }
  });

  it('fails when NEXT_PUBLIC_APP_URL is not a valid URL', () => {
    const testConfig = { ...validConfig, NEXT_PUBLIC_APP_URL: 'invalid-url-domain' };
    const result = EnvSchema.safeParse(testConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('NEXT_PUBLIC_APP_URL'));
      expect(issue).toBeDefined();
    }
  });

  it('validates .env.example contains all 9 required variables and parses cleanly', () => {
    const envExamplePath = path.join(process.cwd(), '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);

    const envContent = fs.readFileSync(envExamplePath, 'utf-8');
    const parsedEntries: Record<string, string> = {};

    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        parsedEntries[key] = value;
      }
    }

    // Verify all 9 required keys are documented in .env.example
    for (const key of requiredKeys) {
      expect(parsedEntries).toHaveProperty(key);
      expect(parsedEntries[key]).not.toBe('');
    }

    // Verify .env.example parses cleanly against the schema
    const result = EnvSchema.safeParse(parsedEntries);
    expect(result.success).toBe(true);
  });
});
