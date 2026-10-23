import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/db/supabase-server';
import { EditorLayout } from '@/components/editor/EditorLayout';
import type { Resume } from '@/types/resume';

type EditPageProps = {
  params: Promise<{ id: string }> | { id: string };
};

export const metadata: Metadata = {
  title: 'Edit Resume | ATS Resume Builder',
  description: 'Guided resume editor with live formatting, strict constraints, and debounced autosave.',
};

async function ResumeEditContent({ params }: EditPageProps) {
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
    redirect(`/login?returnTo=/resumes/${id}/edit`);
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

  const initialResume = {
    id: resumeRecord.id,
    title: resumeRecord.title ?? 'Untitled Resume',
    template: resumeRecord.template ?? 'standard',
    content: (resumeRecord.content ?? {}) as Resume,
  };

  return <EditorLayout initialResume={initialResume} />;
}

function EditLoadingSkeleton() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading resume editor...</p>
      </div>
    </div>
  );
}

export default function ResumeEditPage(props: EditPageProps) {
  return (
    <Suspense fallback={<EditLoadingSkeleton />}>
      <ResumeEditContent params={props.params} />
    </Suspense>
  );
}