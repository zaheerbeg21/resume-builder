import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/supabase-server';
import { getUserEntitlement } from '@/lib/billing/entitlements';

/**
 * GET /api/auth/session
 * Returns current user email, pass status, and resume count for the global AppShell.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
        }

        const [resumesResult, entitlement] = await Promise.all([
            supabase
                .from('resumes')
                .select('id, title, updated_at')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false }),
            getUserEntitlement(user.id).catch(() => ({
                hasActivePass: false,
                daysRemaining: 0,
            })),
        ]);

        const resumes = resumesResult.data ?? [];

        return NextResponse.json({
            authenticated: true,
            user: {
                id: user.id,
                email: user.email ?? '',
            },
            entitlement: {
                hasActivePass: entitlement.hasActivePass,
                daysRemaining: entitlement.daysRemaining,
            },
            resumeCount: resumes.length,
            latestResumeId: resumes[0]?.id ?? null,
            resumes: resumes.map((r) => ({ id: r.id, title: r.title || 'Untitled Resume' })),
        });
    } catch {
        return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }
}

/**
 * POST /api/auth/session
 * Signs out the user on the server and clears Supabase auth cookies.
 */
export async function POST() {
    try {
        const supabase = await createClient();
        await supabase.auth.signOut();
        return NextResponse.json({ success: true }, { status: 200 });
    } catch {
        return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 });
    }
}