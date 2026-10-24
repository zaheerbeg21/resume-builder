import React from 'react';
import Link from 'next/link';

interface LogoProps {
    className?: string;
    showText?: boolean;
}

export function Logo({ className = 'h-8 w-auto', showText = true }: LogoProps) {
    return (
        // <Link
        //     href="/"
        //     className="inline-flex items-center gap-3 font-bold tracking-tight text-slate-900 transition-opacity hover:opacity-90 dark:text-white"
        // >
        <Link
            href="/"
            aria-label="ATSProof - Resume Builder"
            className="inline-flex items-center gap-3 font-bold tracking-tight text-slate-900 transition-opacity hover:opacity-90 dark:text-white"
        >

            {/* Precision Document Icon Mark */}
            <svg
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={className}
            >
                {/* Document Outline */}
                <rect
                    x="8"
                    y="5"
                    width="20"
                    height="28"
                    rx="3"
                    className="stroke-slate-900 dark:stroke-slate-100"
                    strokeWidth="2.5"
                    fill="none"
                />
                {/* Document Fold */}
                <path
                    d="M22 5V11H28"
                    className="stroke-slate-900 dark:stroke-slate-100"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {/* Text Guidelines */}
                <line x1="12" y1="14" x2="20" y2="14" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="2" strokeLinecap="round" />
                <line x1="12" y1="18" x2="24" y2="18" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="2" strokeLinecap="round" />
                <line x1="12" y1="22" x2="19" y2="22" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="2" strokeLinecap="round" />

                {/* ATS Laser Scan Bar */}
                <rect x="4" y="19.5" width="28" height="2" rx="1" fill="#4f46e5" />

                {/* Verified Badge */}
                <circle cx="28" cy="28" r="8" fill="#0f172a" />
                <circle cx="28" cy="28" r="7" fill="#10b981" />
                <path d="M25 28L27.2 30.2L31.5 25.8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            {/* Brand Typography */}
            {showText && (
                <span className="flex flex-col text-left leading-tight">
                    <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                        ATS<span className="text-emerald-500">Proof</span>
                    </span>
                    <span className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase dark:text-slate-400">
                        Resume Builder
                    </span>
                </span>
            )}
        </Link>
    );
}