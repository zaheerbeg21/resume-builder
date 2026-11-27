'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';

interface SessionData {
    authenticated: boolean;
    user: {
        id: string;
        email: string;
    } | null;
    entitlement?: {
        hasActivePass: boolean;
        daysRemaining: number;
        expiresAt: string | null;
    };
    resumeCount?: number;
    latestResumeId?: string | null;
    resumes?: Array<{ id: string; title: string }>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    // Detect if user is inside a specific resume workspace (/resumes/[id]/edit or /target)
    const resumeMatch = pathname?.match(/^\/resumes\/([^/]+)\/(edit|target)/);
    const activeResumeId = resumeMatch ? resumeMatch[1] : null;
    const activeResumeMode = resumeMatch ? (resumeMatch[2] as 'edit' | 'target') : null;
    const isWorkspaceRoute = Boolean(activeResumeId);

    // Auto-collapse sidebar inside editor/target like Rezi, expand on dashboard/billing
    const [prevPathname, setPrevPathname] = useState(pathname);
    const [isCollapsed, setIsCollapsed] = useState(isWorkspaceRoute);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [atsGuideOpen, setAtsGuideOpen] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [session, setSession] = useState<SessionData | null>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);

    // Sync collapse and overlay state when switching routes without a cascading effect
    if (prevPathname !== pathname) {
        setPrevPathname(pathname);
        setIsCollapsed(isWorkspaceRoute);
        setMobileNavOpen(false);
        setUserMenuOpen(false);
        setAtsGuideOpen(false);
    }

    // Close ATS guide modal on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setAtsGuideOpen(false);
            }
        };
        if (atsGuideOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [atsGuideOpen]);

    // Fetch user session, pass status, and quota count
    useEffect(() => {
        let isMounted = true;
        fetch('/api/auth/session')
            .then((res) => res.json())
            .then((data: SessionData) => {
                if (isMounted) setSession(data);
            })
            .catch(() => { });
        return () => {
            isMounted = false;
        };
    }, [pathname]);

    // Close avatar dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        if (isSigningOut) return;
        setIsSigningOut(true);
        try {
            await fetch('/api/auth/session', { method: 'POST' });
        } finally {
            router.replace('/login');
            router.refresh();
        }
    };

    const handleCreateResumeAction = () => {
        if (pathname === '/dashboard') {
            window.dispatchEvent(new CustomEvent('ats:open-create-resume'));
        } else {
            router.push('/dashboard?action=create');
        }
        setMobileNavOpen(false);
    };

    const handleImportResumeAction = () => {
        if (pathname === '/dashboard') {
            window.dispatchEvent(new CustomEvent('ats:open-import-resume'));
        } else {
            router.push('/dashboard?action=import');
        }
        setMobileNavOpen(false);
    };

    const userEmail = session?.user?.email || '';
    const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : 'U';
    const hasActivePass = session?.entitlement?.hasActivePass ?? false;
    const daysRemaining = session?.entitlement?.daysRemaining ?? 0;
    const resumeCount = session?.resumeCount ?? 0;
    const targetResumeId = activeResumeId || session?.latestResumeId;

    return (
        <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
            {/* Desktop Left Sidebar (Rezi-style dark navy/indigo gradient) */}
            <aside
                className={`hidden md:flex flex-col justify-between shrink-0 bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 text-white border-r border-slate-800 transition-all duration-200 select-none ${isCollapsed ? 'w-16' : 'w-60'
                    }`}
            >
                {/* Top Section: Brand + Create CTA + Links */}
                <div className="flex flex-col gap-2 p-3">
                    {/* Brand Header & Collapse Toggle */}
                    <div className="flex items-center justify-between h-12 px-1">
                        {!isCollapsed ? (
                            <Link href="/dashboard" className="flex items-center gap-2.5 group">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-sm shadow-sm">
                                    AP
                                </div>
                                <div className="flex flex-col leading-none">
                                    <span className="font-extrabold text-base tracking-tight text-white">
                                        ATS<span className="text-emerald-400">Proof</span>
                                    </span>
                                    <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                                        Resume Builder
                                    </span>
                                </div>
                            </Link>
                        ) : (
                            <Link
                                href="/dashboard"
                                title="ATSProof Dashboard"
                                className="mx-auto w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-sm shadow-sm hover:opacity-90"
                            >
                                AP
                            </Link>
                        )}

                        {!isCollapsed && (
                            <button
                                type="button"
                                onClick={() => setIsCollapsed(true)}
                                title="Collapse sidebar"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {isCollapsed && (
                        <button
                            type="button"
                            onClick={() => setIsCollapsed(false)}
                            title="Expand sidebar"
                            className="mx-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    )}

                    {/* Primary CTA: + CREATE NEW RESUME */}
                    <button
                        type="button"
                        onClick={handleCreateResumeAction}
                        title="Create New Resume"
                        className={`mt-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer ${isCollapsed ? 'h-10 w-10 mx-auto' : 'px-3 py-2.5 w-full'
                            }`}
                    >
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        {!isCollapsed && <span>Create New Resume</span>}
                    </button>

                    {/* Navigation Menu Items */}
                    <nav className="mt-3 flex flex-col gap-1">
                        {/* 1. My Dashboard */}
                        <Link
                            href="/dashboard"
                            title="My Dashboard"
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${pathname === '/dashboard'
                                    ? 'bg-white/15 text-white shadow-xs'
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                        >
                            <svg className="w-4 h-4 shrink-0 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            {!isCollapsed && <span>My Dashboard</span>}
                        </Link>

                        {/* 2. Import PDF Resume */}
                        <button
                            type="button"
                            onClick={handleImportResumeAction}
                            title="Import Existing PDF Resume"
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer ${isCollapsed ? 'justify-center px-0' : 'w-full text-left'
                                }`}
                        >
                            <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            {!isCollapsed && (
                                <div className="flex items-center justify-between w-full">
                                    <span>Import PDF</span>
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/20 text-emerald-300 rounded">
                                        AI
                                    </span>
                                </div>
                            )}
                        </button>

                        {/* 3. Resume Editor (if resume exists) */}
                        {targetResumeId && (
                            <Link
                                href={`/resumes/${targetResumeId}/edit`}
                                title="Resume Editor & Live PDF Preview"
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${activeResumeMode === 'edit'
                                        ? 'bg-white/15 text-white shadow-xs'
                                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                    } ${isCollapsed ? 'justify-center px-0' : ''}`}
                            >
                                <svg className="w-4 h-4 shrink-0 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                {!isCollapsed && <span>Resume Editor</span>}
                            </Link>
                        )}

                        {/* 4. JD Keyword Targeting */}
                        {targetResumeId && (
                            <Link
                                href={`/resumes/${targetResumeId}/target`}
                                title="JD Keyword Match & Scoring"
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${activeResumeMode === 'target'
                                        ? 'bg-white/15 text-white shadow-xs'
                                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                    } ${isCollapsed ? 'justify-center px-0' : ''}`}
                            >
                                <svg className="w-4 h-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {!isCollapsed && (
                                    <div className="flex items-center justify-between w-full">
                                        <span>JD Keyword Match</span>
                                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-300 rounded">
                                            SCORE
                                        </span>
                                    </div>
                                )}
                            </Link>
                        )}

                        {/* 5. In-App ATS Format Guide */}
                        <button
                            type="button"
                            onClick={() => setAtsGuideOpen(true)}
                            title="ATS Format Guide & Pre-Flight Rules"
                            data-testid="sidebar-ats-guide-btn"
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer ${isCollapsed ? 'justify-center px-0' : 'w-full text-left'
                                }`}
                        >
                            <svg className="w-4 h-4 shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {!isCollapsed && <span>ATS Format Guide</span>}
                        </button>

                        {/* 6. Billing & 30-Day Pass */}
                        <Link
                            href="/billing"
                            title="Billing & 30-Day All-Access Pass"
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${pathname === '/billing'
                                    ? 'bg-white/15 text-white shadow-xs'
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                        >
                            <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            {!isCollapsed && (
                                <div className="flex items-center justify-between w-full">
                                    <span>30-Day Pass</span>
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-indigo-500/30 text-indigo-200 rounded">
                                        {hasActivePass ? 'ACTIVE' : '$19'}
                                    </span>
                                </div>
                            )}
                        </Link>
                    </nav>
                </div>

                {/* Bottom Section: Quota Bar + Direct Logout */}
                <div className="p-3 border-t border-white/10 space-y-2">
                    {!isCollapsed ? (
                        <div className="rounded-lg bg-white/5 p-3">
                            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                <span>Resumes</span>
                                <span>{resumeCount} / 5</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${resumeCount >= 5 ? 'bg-amber-400' : 'bg-emerald-400'
                                        }`}
                                    style={{ width: `${Math.min(100, (resumeCount / 5) * 100)}%` }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div
                            title={`${resumeCount} of 5 resumes created`}
                            className="text-center text-[10px] font-bold text-slate-300 py-1 bg-white/5 rounded"
                        >
                            {resumeCount}/5
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        title="Log out"
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 transition-colors cursor-pointer w-full ${isCollapsed ? 'justify-center px-0' : ''
                            }`}
                    >
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {!isCollapsed && <span>{isSigningOut ? 'Logging out...' : 'Log out'}</span>}
                    </button>
                </div>
            </aside>

            {/* Right Column: Top Navigation Bar + Page Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Global Authenticated Top Bar (Matches Rezi Top Bar) */}
                <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-40">
                    {/* Left: Mobile Menu Button + Context Switcher Pills */}
                    <div className="flex items-center gap-3">
                        {/* Mobile Hamburger */}
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(!mobileNavOpen)}
                            aria-label="Open navigation menu"
                            className="md:hidden p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>

                        {/* Rezi-Style Top Mode Pills */}
                        {isWorkspaceRoute && activeResumeId ? (
                            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                                <Link
                                    href="/dashboard"
                                    className="px-2.5 py-1 rounded-md text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1"
                                >
                                    <span>← Resumes</span>
                                </Link>
                                <span className="text-zinc-300 dark:text-zinc-700">|</span>
                                <Link
                                    href={`/resumes/${activeResumeId}/edit`}
                                    className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${activeResumeMode === 'edit'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
                                        }`}
                                >
                                    1. Finish Up & Preview
                                </Link>
                                <Link
                                    href={`/resumes/${activeResumeId}/target`}
                                    className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${activeResumeMode === 'target'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
                                        }`}
                                >
                                    2. AI Keyword Targeting
                                </Link>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                                <Link
                                    href="/dashboard"
                                    className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${pathname === '/dashboard'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
                                        }`}
                                >
                                    Resumes
                                </Link>
                                {targetResumeId && (
                                    <Link
                                        href={`/resumes/${targetResumeId}/target`}
                                        className="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-all"
                                    >
                                        JD Match Score
                                    </Link>
                                )}
                                <Link
                                    href="/billing"
                                    className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${pathname === '/billing'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
                                        }`}
                                >
                                    30-Day Pass
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Right: Upgrade Pill + Rezi-Style Avatar Dropdown */}
                    <div className="flex items-center gap-3">
                        {hasActivePass ? (
                            <Link
                                href="/billing"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                            >
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                <span>Pass Active ({daysRemaining}d)</span>
                            </Link>
                        ) : (
                            <Link
                                href="/billing"
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                </svg>
                                <span>Upgrade</span>
                            </Link>
                        )}

                        {/* User Avatar Circle + Dropdown (Matches Rezi Screenshot 1) */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                type="button"
                                onClick={() => setUserMenuOpen((prev) => !prev)}
                                aria-label="Account menu"
                                data-testid="user-account-menu-btn"
                                className="flex items-center gap-1.5 focus:outline-none cursor-pointer group"
                            >
                                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs group-hover:ring-2 group-hover:ring-indigo-400 transition-all">
                                    {userInitial}
                                </div>
                                <svg
                                    className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2.5}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {userMenuOpen && (
                                <div
                                    data-testid="user-account-dropdown"
                                    className="absolute right-0 mt-2 w-64 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-2 z-50"
                                >
                                    {/* Email & Plan Header */}
                                    <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                            {userEmail || 'Signed In User'}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2 text-xs">
                                            <span className="text-zinc-500 dark:text-zinc-400">
                                                {hasActivePass ? `30-Day Pass (${daysRemaining}d left)` : 'Free Plan'}
                                            </span>
                                            {!hasActivePass && (
                                                <Link
                                                    href="/billing"
                                                    onClick={() => setUserMenuOpen(false)}
                                                    className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                                >
                                                    Upgrade
                                                </Link>
                                            )}
                                        </div>
                                    </div>

                                    {/* Menu Links */}
                                    <div className="py-1">
                                        <Link
                                            href="/dashboard"
                                            onClick={() => setUserMenuOpen(false)}
                                            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                        >
                                            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                            </svg>
                                            <span>My Dashboard</span>
                                        </Link>

                                        <Link
                                            href="/billing"
                                            onClick={() => setUserMenuOpen(false)}
                                            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                        >
                                            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            <span>Account & Billing</span>
                                        </Link>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setUserMenuOpen(false);
                                                setAtsGuideOpen(true);
                                            }}
                                            data-testid="menu-ats-guide-btn"
                                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left cursor-pointer"
                                        >
                                            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span>ATS Format Guide</span>
                                        </button>
                                    </div>

                                    {/* Log out */}
                                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1 mt-1">
                                        <button
                                            type="button"
                                            onClick={handleSignOut}
                                            disabled={isSigningOut}
                                            data-testid="logout-menu-btn"
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            <span>{isSigningOut ? 'Logging out...' : 'Log out'}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Mobile Slide-Down Drawer */}
                {mobileNavOpen && (
                    <div className="md:hidden bg-slate-900 text-white px-4 py-4 space-y-2 border-b border-slate-800">
                        <div className="pb-2 mb-2 border-b border-slate-800 flex items-center justify-between">
                            <Logo className="h-7 w-auto" />
                            <span className="text-xs text-slate-400">{resumeCount} / 5 Resumes</span>
                        </div>
                        <Link
                            href="/dashboard"
                            className="block py-2 text-sm font-semibold text-white"
                        >
                            📄 My Dashboard
                        </Link>
                        <button
                            type="button"
                            onClick={handleCreateResumeAction}
                            className="block w-full text-left py-2 text-sm font-semibold text-indigo-300"
                        >
                            ➕ Create New Resume
                        </button>
                        <button
                            type="button"
                            onClick={handleImportResumeAction}
                            className="block w-full text-left py-2 text-sm font-semibold text-emerald-300"
                        >
                            📥 Import PDF Resume
                        </button>
                        {targetResumeId && (
                            <>
                                <Link
                                    href={`/resumes/${targetResumeId}/edit`}
                                    className="block py-2 text-sm font-semibold text-sky-300"
                                >
                                    ✏️ Resume Editor
                                </Link>
                                <Link
                                    href={`/resumes/${targetResumeId}/target`}
                                    className="block py-2 text-sm font-semibold text-amber-300"
                                >
                                    🎯 JD Keyword Match
                                </Link>
                            </>
                        )}
                        <Link
                            href="/billing"
                            className="block py-2 text-sm font-semibold text-slate-200"
                        >
                            💳 Billing & 30-Day Pass
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                setMobileNavOpen(false);
                                setAtsGuideOpen(true);
                            }}
                            className="block w-full text-left py-2 text-sm font-semibold text-purple-300"
                        >
                            📋 ATS Format Guide
                        </button>
                        <button
                            type="button"
                            onClick={handleSignOut}
                            className="w-full mt-2 py-2 text-left text-sm font-semibold text-rose-400 border-t border-slate-800 pt-3"
                        >
                            ↪ Log out ({userEmail})
                        </button>
                    </div>
                )}

                {/* Main View Content */}
                <div className="flex-1 min-w-0">{children}</div>
            </div>

            {/* ATS Format Guide & Pre-Flight Rules Modal */}
            {atsGuideOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ats-guide-title"
                    data-testid="ats-guide-modal"
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setAtsGuideOpen(false);
                    }}
                >
                    <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-4 bg-zinc-50 dark:bg-zinc-950/50">
                            <div>
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 mb-2">
                                    <svg className="w-3 h-3 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Parser Verification Rules
                                </div>
                                <h3 id="ats-guide-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                                    ATS Format Guide & Pre-Flight Rules
                                </h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    How ATSProof guarantees 100% clean parsing across Workday, Greenhouse, Lever, and Taleo.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAtsGuideOpen(false)}
                                aria-label="Close guide"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Rules Body */}
                        <div className="px-6 py-5 overflow-y-auto space-y-4 text-xs text-zinc-600 dark:text-zinc-300">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Rule 1 */}
                                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40">
                                    <div className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px]">
                                            1
                                        </span>
                                        Single-Column Layout
                                    </div>
                                    <p className="mt-1.5 leading-relaxed text-[11px] text-zinc-500 dark:text-zinc-400">
                                        Multi-column tables and floating text boxes scramble line order when parsed linearly by ATS engines. ATSProof renders pure single-column PDFs.
                                    </p>
                                </div>

                                {/* Rule 2 */}
                                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40">
                                    <div className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px]">
                                            2
                                        </span>
                                        Standard Section Headers
                                    </div>
                                    <p className="mt-1.5 leading-relaxed text-[11px] text-zinc-500 dark:text-zinc-400">
                                        Use recognized names (<code className="font-mono text-zinc-700 dark:text-zinc-300">Experience</code>, <code className="font-mono text-zinc-700 dark:text-zinc-300">Education</code>, <code className="font-mono text-zinc-700 dark:text-zinc-300">Skills</code>, <code className="font-mono text-zinc-700 dark:text-zinc-300">Projects</code>). Creative headings get dropped into unparsed blobs.
                                    </p>
                                </div>

                                {/* Rule 3 */}
                                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40">
                                    <div className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px]">
                                            3
                                        </span>
                                        Embedded Static Fonts
                                    </div>
                                    <p className="mt-1.5 leading-relaxed text-[11px] text-zinc-500 dark:text-zinc-400">
                                        System-dependent or variable fonts cause replacement glyphs (<code className="font-mono"></code>). All ATSProof exports embed static Inter or Serif TrueType fonts with 0 fallbacks.
                                    </p>
                                </div>

                                {/* Rule 4 */}
                                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40">
                                    <div className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px]">
                                            4
                                        </span>
                                        Real Selectable Text
                                    </div>
                                    <p className="mt-1.5 leading-relaxed text-[11px] text-zinc-500 dark:text-zinc-400">
                                        Never put contact info or skills in header/footer streams or canvas graphics. ATS crawlers discard graphic streams and un-parseable icons.
                                    </p>
                                </div>
                            </div>

                            {/* Pro-Tip Box */}
                            <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/50 flex items-start gap-3">
                                <span className="text-base shrink-0">🎯</span>
                                <div>
                                    <span className="font-bold text-indigo-900 dark:text-indigo-200 text-xs">
                                        Deterministic Keyword Match
                                    </span>
                                    <p className="mt-0.5 text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                                        Target your resume against real job descriptions using the JD Keyword Match panel. We compute keyword coverage, title overlap, and section weights deterministically without AI hallucination.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer & Direct Action Buttons */}
                        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => setAtsGuideOpen(false)}
                                className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                                Close Guide
                            </button>

                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                {targetResumeId ? (
                                    <>
                                        <Link
                                            href={`/resumes/${targetResumeId}/edit`}
                                            onClick={() => setAtsGuideOpen(false)}
                                            className="flex-1 sm:flex-none text-center px-3.5 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-semibold text-xs transition-colors"
                                        >
                                            Edit My Resume
                                        </Link>
                                        <Link
                                            href={`/resumes/${targetResumeId}/target`}
                                            onClick={() => setAtsGuideOpen(false)}
                                            className="flex-1 sm:flex-none text-center px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs transition-colors"
                                        >
                                            Run JD Keyword Match →
                                        </Link>
                                    </>
                                ) : (
                                    <Link
                                        href="/dashboard"
                                        onClick={() => setAtsGuideOpen(false)}
                                        className="w-full sm:w-auto text-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs transition-colors"
                                    >
                                        Go to My Dashboard →
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}