import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as supabaseServer from '@/lib/db/supabase-server';
import {
  BulletResultSchema,
  BulletVariantSchema,
  BulletOptimizeInputSchema,
  type BulletResult,
} from '@/lib/ai/schemas';
import { verifyZeroInventedDigits, verifyWordCount } from '@/lib/ai/guards';
import {
  POST as bulletOptimizeRoute,
  generateDeterministicBulletResult,
} from '@/app/api/ai/bullet-optimize/route';
import { BulletImproverModal } from '@/components/editor/BulletImproverModal';
import { ExperienceSection } from '@/components/editor/sections/ExperienceSection';
import { useResumeStore, DEFAULT_RESUME } from '@/lib/stores/resume-store';

describe('Truth-Bound AI Bullet Improver Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useResumeStore.setState({
      resumeId: 'test-res-ai-1',
      title: 'Full Stack Engineer Resume',
      template: 'standard',
      resume: {
        ...DEFAULT_RESUME,
        experience: [
          {
            id: 'exp-101',
            company: 'TechCorp Solutions',
            title: 'Senior Software Engineer',
            location: 'San Francisco, CA',
            start: '2021-01',
            end: null,
            current: true,
            bullets: [
              'Built microservices and optimized database queries for core platform.',
            ],
          },
        ],
      },
      isDirty: false,
      isSaving: false,
      lastSavedAt: null,
      saveStatus: 'idle',
      saveError: null,
    });
  });

  describe('1. Adversarial Digit Guard (verifyZeroInventedDigits)', () => {
    it('accepts variants when no digits exist and bracketed placeholders are used', () => {
      const raw = 'Refactored backend data structures and improved throughput';
      const variant =
        'Engineered optimized data structures, measured by [X%] improvement in throughput, by refactoring backend routines.';
      expect(verifyZeroInventedDigits(raw, variant)).toBe(true);
    });

    it('accepts variants when all digits and sequences exist in raw bullet', () => {
      const raw = 'Reduced query latency by 45% and scaled system to 1000 concurrent users';
      const variant =
        'Engineered database optimizations, measured by 45% reduction in latency, scaling to 1000 users.';
      expect(verifyZeroInventedDigits(raw, variant)).toBe(true);
    });

    it('accepts variants when numbers are supplied in userFacts', () => {
      const raw = 'Built caching layer to improve website speed';
      const userFacts = 'Achieved 30% reduction in response time across 5 regional clusters';
      const variant =
        'Architected distributed caching layers, measured by 30% reduction in response time across 5 clusters, by optimizing edge nodes.';
      expect(verifyZeroInventedDigits(raw, variant, userFacts)).toBe(true);
    });

    it('adversarial: rejects hallucinated percentage metrics not in input', () => {
      const raw = 'Built backend services and fixed query bottlenecks';
      // 40% was completely made up by the model
      const variant =
        'Engineered scalable backend services, measured by 40% reduction in latency, by optimizing data pipelines.';
      expect(verifyZeroInventedDigits(raw, variant)).toBe(false);
    });

    it('adversarial: rejects altered digit sequences (e.g. 15% changed to 50%)', () => {
      const raw = 'Optimized build times by 15% using parallel workers';
      const variant =
        'Accelerated continuous integration pipelines, measured by 50% faster build cycles, by deploying parallel workers.';
      expect(verifyZeroInventedDigits(raw, variant)).toBe(false);
    });

    it('adversarial: rejects digit inflation (e.g. 5 users changed to 50 users)', () => {
      const raw = 'Led an engineering squad of 5 engineers';
      const variant =
        'Spearheaded technical roadmap for 50 engineers, measured by [X%] delivery velocity, through agile alignment.';
      expect(verifyZeroInventedDigits(raw, variant)).toBe(false);
    });

    it('adversarial: rejects recombined/rearranged digits (e.g. source has 12 and 5, variant invents 125 or 52)', () => {
      const raw = 'Managed 12 repositories across 5 teams';
      const variant1 =
        'Spearheaded multi-repo synchronization across 125 projects, measured by [X%] efficiency, by standardizing CI workflows.';
      const variant2 =
        'Spearheaded multi-repo synchronization across 52 projects, measured by [X%] efficiency, by standardizing CI workflows.';

      expect(verifyZeroInventedDigits(raw, variant1)).toBe(false);
      expect(verifyZeroInventedDigits(raw, variant2)).toBe(false);
    });

    it('accepts normalized comma-formatted numbers ($1,000 in raw vs $1000 in variant)', () => {
      const raw = 'Managed budget of $1,000 for server infrastructure';
      const variant =
        'Optimized server infrastructure, measured by staying within $1000 budget, by eliminating unused cloud resources.';
      expect(verifyZeroInventedDigits(raw, variant)).toBe(true);
    });
  });

  describe('2. Word Count Guard (verifyWordCount)', () => {
    it('accepts bullets within standard 12 to 32 word boundaries', () => {
      const bullet12Words =
        'Architected high performance microservices delivering scalable solutions across multiple distributed enterprise cloud platforms.';
      expect(verifyWordCount(bullet12Words)).toBe(true);

      const bullet20Words =
        'Engineered robust backend application services, measured by [X%] improvement in query latency, by systematically refactoring legacy data access layers.';
      expect(verifyWordCount(bullet20Words)).toBe(true);

      const bullet32Words =
        'Spearheaded cloud migration delivering modern containerized applications across diverse hybrid infrastructure environments, measured by [X%] reduction in deployment overhead, through rigorous peer code reviews and comprehensive automated testing frameworks across engineering teams.';
      expect(verifyWordCount(bullet32Words)).toBe(true);
    });

    it('rejects bullets shorter than 12 words', () => {
      const shortBullet = 'Fixed bugs and deployed code to production server.';
      expect(verifyWordCount(shortBullet)).toBe(false);
    });

    it('rejects bullets longer than 32 words', () => {
      const overlyLongBullet =
        'Architected, designed, and deployed large scale distributed microservices applications across global hybrid cloud infrastructure environments, measured by achieving [X%] faster response cycles and superior fault tolerance, through systematic refactoring, advanced automated integration testing pipelines, cross-functional collaboration with DevOps teams, and continuous architectural documentation.';
      expect(verifyWordCount(overlyLongBullet)).toBe(false);
    });

    it('rejects empty or whitespace-only strings', () => {
      expect(verifyWordCount('')).toBe(false);
      expect(verifyWordCount('    ')).toBe(false);
    });
  });

  describe('3. Schema Conformance (BulletResultSchema)', () => {
    it('successfully parses valid 3-variant results with style badges', () => {
      const validPayload: BulletResult = {
        variants: [
          {
            style: 'conservative',
            text: 'Engineered robust enhancements for backend microservices, measured by [X%] performance improvement, by optimizing workflows.',
            keywords_used: ['TypeScript'],
          },
          {
            style: 'metric_focused',
            text: 'Accelerated operational velocity across critical systems, measured by achieving [X%] improvement in turnaround time, by automating execution paths.',
            keywords_used: ['TypeScript'],
          },
          {
            style: 'scope_focused',
            text: 'Architected resilient technical infrastructure for backend services, measured by [X%] operational stability, by standardizing interfaces.',
            keywords_used: [],
          },
        ],
        placeholders_needed: [
          {
            token: '[X%]',
            question: 'What percentage improvement, speedup, or efficiency gain was achieved?',
          },
        ],
      };

      const parsed = BulletResultSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
    });

    it('rejects results with fewer or more than 3 variants', () => {
      const twoVariants = {
        variants: [
          {
            style: 'conservative',
            text: 'Engineered robust enhancements for backend microservices, measured by [X%] performance improvement, by optimizing workflows.',
            keywords_used: [],
          },
          {
            style: 'metric_focused',
            text: 'Accelerated operational velocity across critical systems, measured by achieving [X%] improvement in turnaround time, by automating execution paths.',
            keywords_used: [],
          },
        ],
        placeholders_needed: [],
      };

      expect(BulletResultSchema.safeParse(twoVariants).success).toBe(false);
    });

    it('rejects variants shorter than 40 characters or longer than 260 characters', () => {
      const tooShort = {
        style: 'conservative',
        text: 'Short bullet text.', // < 40 chars
        keywords_used: [],
      };
      expect(BulletVariantSchema.safeParse(tooShort).success).toBe(false);

      const tooLong = {
        style: 'conservative',
        text: 'A'.repeat(261), // > 260 chars
        keywords_used: [],
      };
      expect(BulletVariantSchema.safeParse(tooLong).success).toBe(false);
    });

    it('validates BulletOptimizeInputSchema requires at least 10 chars for rawBullet', () => {
      expect(
        BulletOptimizeInputSchema.safeParse({ rawBullet: 'Too short' }).success
      ).toBe(false);

      expect(
        BulletOptimizeInputSchema.safeParse({
          rawBullet: 'Optimized web application queries',
        }).success
      ).toBe(true);
    });
  });

  describe('4. Deterministic Local Generator & Route Handler', () => {
    it('generateDeterministicBulletResult produces valid variants following XYZ formula', () => {
      const result = generateDeterministicBulletResult({
        rawBullet: 'Implemented automated CI/CD pipelines and decreased release delays',
        roleTitle: 'DevOps Engineer',
        targetKeywords: ['CI/CD', 'Docker'],
        userFacts: '',
        isCurrentRole: false,
      });

      expect(result.variants).toHaveLength(3);
      expect(result.variants[0].style).toBe('conservative');
      expect(result.variants[1].style).toBe('metric_focused');
      expect(result.variants[2].style).toBe('scope_focused');

      // Check XYZ structure: "Accomplished [X], measured by [Y], by doing [Z]"
      for (const variant of result.variants) {
        expect(variant.text).toMatch(/measured by/i);
        expect(variant.text.length).toBeGreaterThanOrEqual(40);
        expect(variant.text.length).toBeLessThanOrEqual(260);
        expect(verifyZeroInventedDigits('Implemented automated CI/CD pipelines', variant.text)).toBe(true);
        expect(verifyWordCount(variant.text, 12, 32)).toBe(true);
      }

      expect(result.placeholders_needed.length).toBeGreaterThan(0);
      expect(result.placeholders_needed[0].token).toBe('[X%]');
    });

    it('generateDeterministicBulletResult selects leadership_focused when leadership context is present', () => {
      const result = generateDeterministicBulletResult({
        rawBullet: 'Lead sprint planning and mentored junior engineers on cloud architecture',
        roleTitle: 'Engineering Lead',
        userFacts: '',
      });

      expect(result.variants[2].style).toBe('leadership_focused');
      expect(result.variants[2].text).toContain('Spearheaded');
    });

    it('POST /api/ai/bullet-optimize returns 401 when user is not authenticated', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      } as unknown as SupabaseClient);

      const req = new Request('http://localhost:3000/api/ai/bullet-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawBullet: 'Valid bullet description for testing' }),
      });

      const res = await bulletOptimizeRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('POST /api/ai/bullet-optimize returns 400 when rawBullet is under 10 chars', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'usr-123', email: 'user@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClient);

      const req = new Request('http://localhost:3000/api/ai/bullet-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawBullet: 'Short' }),
      });

      const res = await bulletOptimizeRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
    });

    it('POST /api/ai/bullet-optimize returns 200 with BulletResult conforming to schema', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'usr-123', email: 'user@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClient);

      const req = new Request('http://localhost:3000/api/ai/bullet-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawBullet: 'Optimized PostgreSQL queries and implemented Redis caching layer',
          roleTitle: 'Senior Software Engineer',
          targetKeywords: ['PostgreSQL', 'Redis'],
          userFacts: 'Reduced query latency by 45%',
          isCurrentRole: true,
        }),
      });

      const res = await bulletOptimizeRoute(req);
      expect(res.status).toBe(200);

      const data: BulletResult = await res.json();
      const parsed = BulletResultSchema.safeParse(data);
      expect(parsed.success).toBe(true);

      // Verify the number from userFacts was preserved without inventing others
      expect(data.variants[0].text).toContain('45%');
      expect(verifyZeroInventedDigits('Optimized PostgreSQL queries', data.variants[0].text, 'Reduced query latency by 45%')).toBe(true);
    });
  });

  describe('5. UI Components & Store Integration', () => {
    it('ExperienceSection renders the inline Improve with AI button for each bullet', () => {
      const html = renderToString(React.createElement(ExperienceSection));
      expect(html).toContain('✨ Improve with AI');
      expect(html).toContain('Built microservices and optimized database queries');
    });

    it('BulletImproverModal renders header, original bullet input, and action buttons', () => {
      const html = renderToString(
        React.createElement(BulletImproverModal, {
          isOpen: true,
          onClose: () => {},
          initialBullet: 'Built microservices and optimized database queries for core platform.',
          roleTitle: 'Senior Software Engineer',
          isCurrentRole: true,
          onApply: () => {},
        })
      );

      expect(html).toContain('Truth-Bound Bullet Improver');
      expect(html).toContain('Original Bullet Text');
      expect(html).toContain('Verified Facts &amp; Numbers');
      expect(html).toContain('Target Keywords');
      expect(html).toContain('Generate Variants');
    });

    it('applying a variant updates the resume store bullet at the exact index', () => {
      const initialExp = useResumeStore.getState().resume.experience[0];
      expect(initialExp.bullets[0]).toBe(
        'Built microservices and optimized database queries for core platform.'
      );

      const newOptimizedBullet =
        'Engineered high-throughput microservices, measured by 35% latency reduction, by refactoring database queries.';

      // Apply update via store action
      useResumeStore
        .getState()
        .updateExperienceBullet(initialExp.id, 0, newOptimizedBullet);

      const updatedExp = useResumeStore.getState().resume.experience[0];
      expect(updatedExp.bullets[0]).toBe(newOptimizedBullet);
      expect(useResumeStore.getState().isDirty).toBe(true);
    });

    it('placeholder substitution resolves bracketed tokens before store persistence', () => {
      const rawWithPlaceholder =
        'Engineered robust microservices, measured by [X%] latency reduction, by refactoring database queries.';
      const token = '[X%]';
      const userMetric = '40%';

      const resolvedText = rawWithPlaceholder.split(token).join(userMetric);
      expect(resolvedText).not.toContain('[X%]');
      expect(resolvedText).toContain('40% latency reduction');

      const expId = useResumeStore.getState().resume.experience[0].id;
      useResumeStore.getState().updateExperienceBullet(expId, 0, resolvedText);

      expect(useResumeStore.getState().resume.experience[0].bullets[0]).toBe(resolvedText);
    });
  });
});
