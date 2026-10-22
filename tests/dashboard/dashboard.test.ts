import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QuotaBadge } from '@/components/dashboard/QuotaBadge';
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard';
import { ResumeCard, type ResumeCardData } from '@/components/dashboard/ResumeCard';
import { CreateResumeDialog } from '@/components/dashboard/CreateResumeDialog';
import { DashboardView, MAX_RESUMES } from '@/components/dashboard/DashboardView';
import DashboardPage from '@/app/(app)/dashboard/page';
import * as supabaseServerModule from '@/lib/db/supabase-server';

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT: ${url}`);
  },
}));

describe('QuotaBadge Component', () => {
  it('renders correctly at 0 / 5 resumes (normal state)', () => {
    const html = renderToString(React.createElement(QuotaBadge, { count: 0, max: 5 }));

    expect(html).toContain('0 / 5 resumes created');
    expect(html).toContain('data-quota-reached="false"');
    expect(html).not.toContain('(Max)');
    expect(html).toContain('bg-emerald-500');
  });

  it('renders correctly at 4 / 5 resumes (available state)', () => {
    const html = renderToString(React.createElement(QuotaBadge, { count: 4, max: 5 }));

    expect(html).toContain('4 / 5 resumes created');
    expect(html).toContain('data-quota-reached="false"');
    expect(html).not.toContain('(Max)');
    expect(html).toContain('bg-emerald-500');
  });

  it('renders warning style and max indicator at 5 / 5 resumes (quota reached)', () => {
    const html = renderToString(React.createElement(QuotaBadge, { count: 5, max: 5 }));

    expect(html).toContain('5 / 5 resumes created');
    expect(html).toContain('data-quota-reached="true"');
    expect(html).toContain('(Max)');
    expect(html).toContain('bg-amber-500');
    expect(html).toContain('text-amber-700');
  });

  it('handles custom max limit if provided', () => {
    const html = renderToString(React.createElement(QuotaBadge, { count: 3, max: 3 }));

    expect(html).toContain('3 / 3 resumes created');
    expect(html).toContain('data-quota-reached="true"');
  });
});

describe('EmptyDashboard Component', () => {
  it('renders empty state illustration, heading, description, and CTA button', () => {
    const html = renderToString(
      React.createElement(EmptyDashboard, { onCreateClick: () => {} })
    );

    expect(html).toContain('data-testid="empty-dashboard"');
    expect(html).toContain('No resumes yet');
    expect(html).toContain('Build an ATS-optimized resume');
    expect(html).toContain('Create Your First Resume');
    expect(html).toContain('data-testid="empty-dashboard-create-btn"');
  });
});

describe('ResumeCard Component', () => {
  const sampleStandardResume: ResumeCardData = {
    id: 'res-abc-123',
    title: 'Senior Distributed Systems Architect',
    template: 'standard',
    updated_at: '2026-10-20T14:30:00.000Z',
  };

  const sampleClassicResume: ResumeCardData = {
    id: 'res-def-456',
    title: 'VP of Engineering',
    template: 'classic',
    updated_at: '2026-10-21T09:15:00.000Z',
  };

  it('renders title, standard template badge, and formatted date', () => {
    const html = renderToString(
      React.createElement(ResumeCard, { resume: sampleStandardResume })
    );

    expect(html).toContain('Senior Distributed Systems Architect');
    expect(html).toContain('Standard');
    expect(html).toContain('Updated Oct 20, 2026');
  });

  it('renders classic template badge for serif template resumes', () => {
    const html = renderToString(
      React.createElement(ResumeCard, { resume: sampleClassicResume })
    );

    expect(html).toContain('VP of Engineering');
    expect(html).toContain('Classic');
    expect(html).toContain('Updated Oct 21, 2026');
  });

  it('renders "Recently" when updated_at is absent or invalid', () => {
    const html = renderToString(
      React.createElement(ResumeCard, {
        resume: {
          id: 'res-no-date',
          title: 'Draft Resume',
          template: 'standard',
        },
      })
    );

    expect(html).toContain('Updated Recently');
  });

  it('renders Edit button linking to /resumes/[id]/edit', () => {
    const html = renderToString(
      React.createElement(ResumeCard, { resume: sampleStandardResume })
    );

    expect(html).toContain('href="/resumes/res-abc-123/edit"');
    expect(html).toContain('data-testid="edit-resume-btn"');
    expect(html).toContain('Edit');
  });

  it('renders Target Job button linking to /resumes/[id]/target', () => {
    const html = renderToString(
      React.createElement(ResumeCard, { resume: sampleStandardResume })
    );

    expect(html).toContain('href="/resumes/res-abc-123/target"');
    expect(html).toContain('data-testid="target-job-btn"');
    expect(html).toContain('Target Job');
  });

  it('renders Delete button with accessible label', () => {
    const html = renderToString(
      React.createElement(ResumeCard, { resume: sampleStandardResume })
    );

    expect(html).toContain('data-testid="delete-resume-btn"');
    expect(html).toContain('aria-label="Delete resume Senior Distributed Systems Architect"');
  });
});

describe('CreateResumeDialog Component', () => {
  it('does not render markup when isOpen is false', () => {
    const html = renderToString(
      React.createElement(CreateResumeDialog, { isOpen: false, onClose: () => {} })
    );

    expect(html).toBe('');
  });

  it('renders title input and template selectors when isOpen is true', () => {
    const html = renderToString(
      React.createElement(CreateResumeDialog, {
        isOpen: true,
        onClose: () => {},
        userEmail: 'alex@example.com',
      })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Create New Resume');
    expect(html).toContain('data-testid="create-resume-title-input"');
    expect(html).toContain('data-testid="template-option-standard"');
    expect(html).toContain('data-testid="template-option-classic"');
    expect(html).toContain('Standard');
    expect(html).toContain('Classic');
    expect(html).toContain('Cancel');
    expect(html).toContain('Create Resume');
  });
});

describe('DashboardView Component & Quota Gating', () => {
  it('enforces MAX_RESUMES quota constant equal to 5', () => {
    expect(MAX_RESUMES).toBe(5);
  });

  const fiveResumes: ResumeCardData[] = [
    { id: '1', title: 'Resume 1', template: 'standard', updated_at: '2026-10-01' },
    { id: '2', title: 'Resume 2', template: 'standard', updated_at: '2026-10-02' },
    { id: '3', title: 'Resume 3', template: 'classic', updated_at: '2026-10-03' },
    { id: '4', title: 'Resume 4', template: 'classic', updated_at: '2026-10-04' },
    { id: '5', title: 'Resume 5', template: 'standard', updated_at: '2026-10-05' },
  ];

  it('renders EmptyDashboard when resume array is empty', () => {
    const html = renderToString(
      React.createElement(DashboardView, { initialResumes: [] })
    );

    expect(html).toContain('data-testid="empty-dashboard"');
    expect(html).not.toContain('data-testid="resumes-grid"');
    expect(html).toContain('0 / 5 resumes created');
  });

  it('enables Create New Resume header button when count < 5', () => {
    const html = renderToString(
      React.createElement(DashboardView, { initialResumes: fiveResumes.slice(0, 3) })
    );

    expect(html).toContain('data-testid="resumes-grid"');
    expect(html).toContain('3 / 5 resumes created');
    expect(html).toContain('data-testid="create-resume-header-btn"');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-disabled="false"');
  });

  it('disables Create New Resume button when quota reaches 5/5', () => {
    const html = renderToString(
      React.createElement(DashboardView, { initialResumes: fiveResumes })
    );

    expect(html).toContain('5 / 5 resumes created');
    expect(html).toContain('data-testid="create-resume-header-btn"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('cursor-not-allowed');
  });
});

describe('DashboardPage Server Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users to /login?returnTo=/dashboard', async () => {
    vi.spyOn(supabaseServerModule, 'createClient').mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error('Session not found'),
        }),
      },
    } as unknown as Awaited<ReturnType<typeof supabaseServerModule.createClient>>);

    await expect(DashboardPage()).rejects.toThrow('NEXT_REDIRECT: /login?returnTo=/dashboard');
    expect(mockRedirect).toHaveBeenCalledWith('/login?returnTo=/dashboard');
  });

  it('renders dashboard with user resumes when authenticated', async () => {
    const mockUserResumes = [
      {
        id: 'res-server-1',
        user_id: 'user-123',
        title: 'Cloud Architect Resume',
        template: 'standard',
        schema_version: 1,
        updated_at: '2026-10-22T10:00:00.000Z',
      },
    ];

    vi.spyOn(supabaseServerModule, 'createClient').mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123', email: 'cloud@example.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockUserResumes,
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof supabaseServerModule.createClient>>);

    const pageElement = await DashboardPage();
    const html = renderToString(pageElement);

    expect(html).toContain('My Resumes');
    expect(html).toContain('Cloud Architect Resume');
    expect(html).toContain('1 / 5 resumes created');
    expect(html).toContain('href="/resumes/res-server-1/edit"');
  });
});
