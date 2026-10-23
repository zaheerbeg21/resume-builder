import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/db/supabase-server';
import { TargetLayout } from '@/components/target/TargetLayout';
import type { Resume } from '@/types/resume';

interface TargetPageProps {
  params: Promise<{ id: string }> | { id: string };
}

export const metadata: Metadata = {
  title: 'Job Description Target & Match | ATS Resume Builder',
  description: 'Target your resume against real job descriptions with deterministic keyword scoring, coverage breakdown, and 1-click skill additions.',
};

async function ResumeTargetContent({ params }: TargetPageProps) {
  const { id } = await Promise.resolve(params);

  if (!id) {
    redirect('/dashboard');
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(`/login?returnTo=/resumes/${id}/target`);
  }

  const { data: resumeRecord, error: resumeError } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (resumeError || !resumeRecord) {
    redirect('/dashboard');
  }

  return (
    <TargetLayout
      resumeId={id}
      initialResume={resumeRecord.content as Resume}
      initialTitle={resumeRecord.title ?? 'Untitled Resume'}
    />
  );
}

function TargetLoadingSkeleton() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading target & match...</p>
      </div>
    </div>
  );
}

export default function ResumeTargetPage(props: TargetPageProps) {
  return (
    <Suspense fallback={<TargetLoadingSkeleton />}>
      <ResumeTargetContent params={props.params} />
    </Suspense>
  );
}