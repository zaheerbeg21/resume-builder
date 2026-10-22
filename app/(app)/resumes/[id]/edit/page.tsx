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

export default async function ResumeEditPage(props: EditPageProps) {
  const { id } = await Promise.resolve(props.params);

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
