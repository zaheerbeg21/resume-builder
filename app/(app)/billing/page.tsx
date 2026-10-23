import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/db/supabase-server';
import { getUserEntitlement } from '@/lib/billing/entitlements';
import { BillingView } from '@/components/billing/BillingView';

export const metadata: Metadata = {
  title: 'Billing & Access Pass | ATS Resume Builder',
  description:
    'Manage your 30-Day All-Access Pass for unlimited ATS resume exports and AI bullet optimizations.',
};

interface BillingPageProps {
  searchParams?: Promise<{
    success?: string;
    canceled?: string;
  }>;
}

async function BillingContent({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; canceled?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login?returnTo=/billing');
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const isSuccess = resolvedParams.success === 'true';
  const isCanceled = resolvedParams.canceled === 'true';

  const { hasActivePass, daysRemaining, entitlement } =
    await getUserEntitlement(user.id);

  return (
    <BillingView
      hasActivePass={hasActivePass}
      daysRemaining={daysRemaining}
      expiresAt={entitlement?.expires_at ?? null}
      userEmail={user.email}
      initialSuccess={isSuccess}
      initialCanceled={isCanceled}
    />
  );
}

export default function BillingPage(props: BillingPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-400">
          Loading billing details...
        </div>
      }
    >
      <BillingContent searchParams={props.searchParams} />
    </Suspense>
  );
}