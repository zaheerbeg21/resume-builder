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
          <div className="bg-zinc-200/70 dark:bg-zinc-900/70 border border-zinc-300 dark:border-zinc-800 rounded-xl p-4 sm:p-6 backdrop-blur-xs shadow-inner">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-300 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-semibold tracking-wide uppercase">
                Live Document Preview ({template === 'classic' ? 'Classic Serif' : 'Standard ATS'})
              </span>
              <span className="text-[11px] bg-zinc-300/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded">
                Letter / A4 Preview
              </span>
            </div>

            {/* Document Sheet Simulation */}
            <div
              data-testid="live-canvas-preview"
              className={`bg-white text-zinc-900 shadow-xl rounded-sm p-8 sm:p-10 border border-zinc-200 max-h-[calc(100vh-140px)] overflow-y-auto leading-normal ${
                template === 'classic' ? 'font-serif' : 'font-sans'
              }`}
            >
              {/* Header: Full Name, Headline, Contact */}
              <div className="text-center border-b border-zinc-300 pb-4 mb-4">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                  {resume.basics.fullName || 'Your Full Name'}
                </h1>
                {resume.basics.headline && (
                  <p className="text-sm font-medium text-zinc-700 mt-1">
                    {resume.basics.headline}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-600 mt-2">
                  {resume.basics.email && <span>{resume.basics.email}</span>}
                  {resume.basics.phone && (
                    <>
                      <span>•</span>
                      <span>{resume.basics.phone}</span>
                    </>
                  )}
                  {resume.basics.location && (
                    <>
                      <span>•</span>
                      <span>{resume.basics.location}</span>
                    </>
                  )}
                </div>

                {resume.basics.links && resume.basics.links.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500 mt-1">
                    {resume.basics.links.map((link, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1">
                        {idx > 0 && <span>•</span>}
                        <span className="underline">{link.label || link.url}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary */}
              {resume.summary && (
                <div className="mb-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-200 pb-1 mb-1.5">
                    Professional Summary
                  </h2>
                  <p className="text-xs text-zinc-700 leading-relaxed">
                    {resume.summary}
                  </p>
                </div>
              )}

              {/* Experience */}
              {resume.experience && resume.experience.length > 0 && (
                <div className="mb-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-200 pb-1 mb-2">
                    Work Experience
                  </h2>
                  <div className="space-y-3">
                    {resume.experience.map((exp) => (
                      <div key={exp.id} className="text-xs">
                        <div className="flex justify-between items-baseline font-semibold text-zinc-900">
                          <span>{exp.title || 'Position Title'}</span>
                          <span className="text-[11px] font-normal text-zinc-500">
                            {exp.start || ''} {exp.start && (exp.end || exp.current) ? '–' : ''}{' '}
                            {exp.current ? 'Present' : exp.end || ''}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline text-zinc-600 italic text-[11px] mb-1">
                          <span>{exp.company || 'Company'}</span>
                          {exp.location && <span>{exp.location}</span>}
                        </div>
                        {exp.bullets && exp.bullets.length > 0 && (
                          <ul className="list-disc list-outside pl-4 space-y-0.5 text-zinc-700 text-[11px] leading-relaxed">
                            {exp.bullets.map((b, bIdx) => (
                              <li key={bIdx}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Education */}
              {resume.education && resume.education.length > 0 && (
                <div className="mb-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-200 pb-1 mb-2">
                    Education
                  </h2>
                  <div className="space-y-2">
                    {resume.education.map((edu) => (
                      <div key={edu.id} className="text-xs">
                        <div className="flex justify-between items-baseline font-semibold text-zinc-900">
                          <span>{edu.school || 'School'}</span>
                          <span className="text-[11px] font-normal text-zinc-500">
                            {edu.start || ''} {edu.start && edu.end ? '–' : ''} {edu.end || ''}
                          </span>
                        </div>
                        <div className="text-zinc-600 italic text-[11px]">
                          {edu.degree || 'Degree'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills */}
              {resume.skills && resume.skills.length > 0 && (
                <div className="mb-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-200 pb-1 mb-1.5">
                    Skills
                  </h2>
                  <div className="space-y-1 text-xs">
                    {resume.skills.map((grp, gIdx) => (
                      <div key={gIdx} className="text-[11px] text-zinc-700">
                        <span className="font-semibold text-zinc-900">{grp.group}: </span>
                        <span>{grp.items.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Projects */}
              {resume.projects && resume.projects.length > 0 && (
                <div className="mb-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-200 pb-1 mb-2">
                    Projects
                  </h2>
                  <div className="space-y-2">
                    {resume.projects.map((proj) => (
                      <div key={proj.id} className="text-xs">
                        <div className="flex justify-between items-baseline font-semibold text-zinc-900">
                          <span>{proj.name || 'Project Name'}</span>
                          {proj.url && (
                            <span className="text-[11px] font-normal text-zinc-500 underline">
                              {proj.url}
                            </span>
                          )}
                        </div>
                        {proj.bullets && proj.bullets.length > 0 && (
                          <ul className="list-disc list-outside pl-4 space-y-0.5 text-zinc-700 text-[11px] leading-relaxed mt-0.5">
                            {proj.bullets.map((b, bIdx) => (
                              <li key={bIdx}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
