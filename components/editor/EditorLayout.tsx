'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useResumeStore } from '@/lib/stores/resume-store';
import type { Resume } from '@/types/resume';
import { EditorHeader } from './EditorHeader';
import { BasicsSection } from './sections/BasicsSection';
import { SummarySection } from './sections/SummarySection';
import { ExperienceSection } from './sections/ExperienceSection';
import { EducationSection } from './sections/EducationSection';
import { SkillsSection } from './sections/SkillsSection';
import { ProjectsSection } from './sections/ProjectsSection';
import { LivePdfPreview } from './LivePdfPreview';

export interface EditorLayoutProps {
  initialResume: {
    id: string;
    title: string;
    template?: string;
    content: Resume;
  };
}

type SectionTab = 'basics' | 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'all';

export function EditorLayout({ initialResume }: EditorLayoutProps) {
  const initResume = useResumeStore((state) => state.initResume);
  const resumeId = useResumeStore((state) => state.resumeId);
  const resume = useResumeStore((state) => state.resume);
  const title = useResumeStore((state) => state.title);
  const template = useResumeStore((state) => state.template);
  const isDirty = useResumeStore((state) => state.isDirty);
  const isSaving = useResumeStore((state) => state.isSaving);
  const setSaveStatus = useResumeStore((state) => state.setSaveStatus);
  const markSaved = useResumeStore((state) => state.markSaved);

  const [activeTab, setActiveTab] = useState<SectionTab>('all');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitialized = useRef(false);

  // Initialize store on first mount
  useEffect(() => {
    if (!hasInitialized.current) {
      initResume(initialResume);
      hasInitialized.current = true;
    }
  }, [initResume, initialResume]);

  // Autosave function calling PUT /api/resumes/[id]
  const performSave = useCallback(async () => {
    if (!resumeId) return;

    try {
      setSaveStatus('saving');
      const res = await fetch(`/api/resumes/${resumeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          template,
          content: resume,
        }),
      });

      if (!res.ok) {
        let errMessage = 'Failed to save changes';
        try {
          const errData = await res.json();
          if (errData?.error) errMessage = errData.error;
        } catch {
          // ignore parsing error
        }
        setSaveStatus('error', errMessage);
        return;
      }

      markSaved();
    } catch {
      setSaveStatus('error', 'Network error while autosaving');
    }
  }, [resumeId, title, template, resume, setSaveStatus, markSaved]);

  // Debounced Autosave: triggers 1000ms after isDirty becomes true
  useEffect(() => {
    if (!isDirty || isSaving || !resumeId) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      performSave();
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isDirty, isSaving, resumeId, performSave]);

  const tabs: { id: SectionTab; label: string }[] = [
    { id: 'all', label: 'All Sections' },
    { id: 'basics', label: 'Basics' },
    { id: 'summary', label: 'Summary' },
    { id: 'experience', label: 'Experience' },
    { id: 'education', label: 'Education' },
    { id: 'skills', label: 'Skills' },
    { id: 'projects', label: 'Projects' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      {/* Top Header */}
      <EditorHeader onManualSave={performSave} />

      {/* Main Split-Pane Container */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane: Form Sections */}
        <div className="lg:col-span-7 xl:col-span-6 space-y-5">
          {/* Section Selector Tabs */}
          <nav
            aria-label="Editor sections"
            className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-zinc-200 dark:border-zinc-800 scrollbar-none"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Form Sections depending on activeTab */}
          <div className="space-y-6">
            {(activeTab === 'all' || activeTab === 'basics') && <BasicsSection />}
            {(activeTab === 'all' || activeTab === 'summary') && <SummarySection />}
            {(activeTab === 'all' || activeTab === 'experience') && <ExperienceSection />}
            {(activeTab === 'all' || activeTab === 'education') && <EducationSection />}
            {(activeTab === 'all' || activeTab === 'skills') && <SkillsSection />}
            {(activeTab === 'all' || activeTab === 'projects') && <ProjectsSection />}
          </div>
        </div>

        {/* Right Pane: Live Document Canvas Preview */}
        <div className="hidden lg:block lg:col-span-5 xl:col-span-6 sticky top-20">
          <LivePdfPreview resume={resume} />
        </div>

      </div>
    </div>
  );
}
