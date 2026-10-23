import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/db/supabase-server';
import { DashboardView } from '@/components/dashboard/DashboardView';

export const metadata: Metadata = {
  title: 'Dashboard | ATS Resume Builder',
  description: 'Manage and create your ATS-optimized resumes.',
};

export async function DashboardContent() {
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

  return <DashboardView initialResumes={resumes ?? []} />;
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-400">
          Loading dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}