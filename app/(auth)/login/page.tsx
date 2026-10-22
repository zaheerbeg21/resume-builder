import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign In | ATS Resume Builder',
  description: 'Sign in to your account to manage, score, and export ATS-optimized resumes.',
};

function LoginFormSkeleton() {
  return (
    <div className="w-full space-y-6 animate-pulse">
      <div className="h-10 bg-slate-200 dark:bg-neutral-800 rounded-lg w-full" />
      <div className="h-4 bg-slate-200 dark:bg-neutral-800 rounded w-1/2 mx-auto" />
      <div className="space-y-4 pt-2">
        <div className="h-10 bg-slate-200 dark:bg-neutral-800 rounded-lg w-full" />
        <div className="h-10 bg-slate-200 dark:bg-neutral-800 rounded-lg w-full" />
        <div className="h-10 bg-slate-300 dark:bg-neutral-700 rounded-lg w-full" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-neutral-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sign in to your account
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">
            Enter your credentials below to access your resumes.
          </p>
        </div>

        <div className="bg-white dark:bg-neutral-900 py-8 px-6 sm:px-8 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-neutral-800">
          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
