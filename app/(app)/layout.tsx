import React, { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';

export default function AuthenticatedAppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Suspense fallback={<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">{children}</div>}>
            <AppShell>{children}</AppShell>
        </Suspense>
    );
}