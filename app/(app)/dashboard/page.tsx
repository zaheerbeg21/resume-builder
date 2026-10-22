import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/db/supabase-server';
import { DashboardView } from '@/components/dashboard/DashboardView';
import type { ResumeCardData } from '@/components/dashboard/ResumeCard';

export const metadata: Metadata = {
  title: 'Dashboard | ATS Resume Builder',
  description: 'Manage your ATS-optimized resumes with 100% parse-back fidelity and evidence-based scoring.',
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login?returnTo=/dashboard');
  }

  const { data: resumes } = await supabase
    .from('resumes')
    .select('id, user_id, title, template, schema_version, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  const formattedResumes: ResumeCardData[] = (resumes ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    template: row.template,
    updated_at: row.updated_at,
  }));

  return (
    <DashboardView
      initialResumes={formattedResumes}
      userEmail={user.email}
    />
  );
}
