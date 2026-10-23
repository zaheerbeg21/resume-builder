'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ResumeParserOutput } from '@/lib/ai/schemas';
import type { Resume } from '@/types/resume';

export interface ImportReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedResume: ResumeParserOutput;
  onSaved?: (savedResume: { id: string; title: string }) => void;
}

/**
 * ImportReviewModal provides a mandatory human-in-the-loop verification step
 * before committing parsed resume data to the database.
 *
 * Any fields identified in low_confidence_paths are prominently marked with
 * an amber "Needs confirmation" badge and editable inputs.
 */
export function ImportReviewModal({
  isOpen,
  onClose,
  parsedResume,
  onSaved,
}: ImportReviewModalProps) {
  const router = useRouter();

  const [title, setTitle] = useState(
    parsedResume.basics.fullName
      ? `${parsedResume.basics.fullName} Resume`
      : 'Imported Resume'
  );
  const [template, setTemplate] = useState<'standard' | 'classic'>('standard');
  const [resumeData, setResumeData] = useState<Resume>(parsedResume);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!isOpen) return null;

  const lowConfidenceSet = new Set(parsedResume.low_confidence_paths || []);
  const isLowConfidence = (path: string) => lowConfidenceSet.has(path);

  const handleBasicsChange = (field: keyof Resume['basics'], value: string) => {
    setResumeData((prev) => ({
      ...prev,
      basics: {
        ...prev.basics,
        [field]: value,
      },
    }));
  };

  const handleExperienceChange = (
    index: number,
    field: 'company' | 'title' | 'start' | 'end',
    value: string
  ) => {
    setResumeData((prev) => {
      const updated = [...prev.experience];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          [field]: value || null,
        };
      }
      return { ...prev, experience: updated };
    });
  };

  const handleEducationChange = (
    index: number,
    field: 'school' | 'degree' | 'start' | 'end',
    value: string
  ) => {
    setResumeData((prev) => {
      const updated = [...prev.education];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          [field]: value || null,
        };
      }
      return { ...prev, education: updated };
    });
  };

  const handleSkillsChange = (index: number, itemsString: string) => {
    setResumeData((prev) => {
      const updated = [...prev.skills];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          items: itemsString
            .split(',')
            .map((i) => i.trim())
            .filter(Boolean),
        };
      }
      return { ...prev, skills: updated };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setIsSaving(true);

    try {
      const payload = {
        title: title.trim() || 'Imported Resume',
        template,
        content: resumeData,
      };

      const res = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save resume. Please try again.');
      }

      if (onSaved && data) {
        onSaved(data);
      }

      onClose();
      if (data?.id) {
        router.push(`/resumes/${data.id}/edit`);
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      data-testid="import-review-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden my-auto"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="review-modal-title"
                data-testid="review-modal-title"
                className="text-lg font-bold text-zinc-900 dark:text-zinc-50"
              >
                Review Parsed Resume
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Extraction Complete
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Confirm your parsed details. Fields marked with amber badges require your confirmation before saving.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close dialog"
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {saveError && (
            <div
              role="alert"
              data-testid="review-save-error"
              className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300"
            >
              {saveError}
            </div>
          )}

          {/* Warnings Banner if parser detected ambiguous fields */}
          {parsedResume.warnings && parsedResume.warnings.length > 0 && (
            <div
              data-testid="review-warnings-box"
              className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 space-y-1"
            >
              <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                <svg className="w-4 h-4 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span>Parsing Warnings ({parsedResume.warnings.length})</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90 pl-1">
                {parsedResume.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <form id="import-review-form" onSubmit={handleSave} className="space-y-6">
            {/* Resume Metadata: Title and Template */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Resume Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="review-input-title"
                  className="w-full px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-zinc-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Template
                </label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as 'standard' | 'classic')}
                  data-testid="review-select-template"
                  className="w-full px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-zinc-400"
                >
                  <option value="standard">Standard (Inter Sans)</option>
                  <option value="classic">Classic (Serif)</option>
                </select>
              </div>
            </div>

            {/* Section 1: Candidate Basics */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
                1. Contact & Header Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* Full Name */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Full Name
                    </label>
                    {isLowConfidence('basics.fullName') && (
                      <span
                        data-testid="badge-low-conf-basics-fullName"
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                      >
                        Needs confirmation
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={resumeData.basics.fullName}
                    onChange={(e) => handleBasicsChange('fullName', e.target.value)}
                    data-testid="review-input-fullName"
                    className={`w-full px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-800 border ${
                      isLowConfidence('basics.fullName')
                        ? 'border-amber-400 dark:border-amber-600 ring-1 ring-amber-300'
                        : 'border-zinc-300 dark:border-zinc-700'
                    } text-zinc-900 dark:text-zinc-100`}
                    required
                  />
                </div>

                {/* Headline */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Headline
                    </label>
                    {isLowConfidence('basics.headline') && (
                      <span
                        data-testid="badge-low-conf-basics-headline"
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                      >
                        Needs confirmation
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={resumeData.basics.headline}
                    onChange={(e) => handleBasicsChange('headline', e.target.value)}
                    data-testid="review-input-headline"
                    placeholder="e.g., Senior Systems Architect"
                    className={`w-full px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-800 border ${
                      isLowConfidence('basics.headline')
                        ? 'border-amber-400 dark:border-amber-600 ring-1 ring-amber-300'
                        : 'border-zinc-300 dark:border-zinc-700'
                    } text-zinc-900 dark:text-zinc-100`}
                  />
                </div>

                {/* Email */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Email Address
                    </label>
                    {isLowConfidence('basics.email') && (
                      <span
                        data-testid="badge-low-conf-basics-email"
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                      >
                        Needs confirmation
                      </span>
                    )}
                  </div>
                  <input
                    type="email"
                    value={resumeData.basics.email}
                    onChange={(e) => handleBasicsChange('email', e.target.value)}
                    data-testid="review-input-email"
                    className={`w-full px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-800 border ${
                      isLowConfidence('basics.email')
                        ? 'border-amber-400 dark:border-amber-600 ring-1 ring-amber-300'
                        : 'border-zinc-300 dark:border-zinc-700'
                    } text-zinc-900 dark:text-zinc-100`}
                    required
                  />
                </div>

                {/* Phone */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Phone Number
                    </label>
                    {isLowConfidence('basics.phone') && (
                      <span
                        data-testid="badge-low-conf-basics-phone"
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                      >
                        Needs confirmation
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={resumeData.basics.phone || ''}
                    onChange={(e) => handleBasicsChange('phone', e.target.value)}
                    data-testid="review-input-phone"
                    placeholder="e.g., +1 (555) 234-5678"
                    className={`w-full px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-800 border ${
                      isLowConfidence('basics.phone')
                        ? 'border-amber-400 dark:border-amber-600 ring-1 ring-amber-300'
                        : 'border-zinc-300 dark:border-zinc-700'
                    } text-zinc-900 dark:text-zinc-100`}
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={resumeData.basics.location || ''}
                    onChange={(e) => handleBasicsChange('location', e.target.value)}
                    data-testid="review-input-location"
                    placeholder="e.g., Austin, TX"
                    className="w-full px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
                  2. Professional Summary
                </h3>
                {isLowConfidence('summary') && (
                  <span
                    data-testid="badge-low-conf-summary"
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                  >
                    Needs confirmation
                  </span>
                )}
              </div>
              <textarea
                rows={3}
                value={resumeData.summary}
                onChange={(e) => setResumeData((prev) => ({ ...prev, summary: e.target.value }))}
                data-testid="review-input-summary"
                placeholder="Brief summary of professional background..."
                className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            {/* Section 3: Work Experience */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
                3. Work Experience ({resumeData.experience.length})
              </h3>
              {resumeData.experience.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No work experience entries extracted.</p>
              ) : (
                <div className="space-y-4">
                  {resumeData.experience.map((exp, idx) => (
                    <div
                      key={exp.id || idx}
                      data-testid={`review-exp-item-${idx}`}
                      className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                        {/* Company */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                              Company
                            </label>
                            {isLowConfidence(`experience.${idx}.company`) && (
                              <span
                                data-testid={`badge-low-conf-experience-${idx}-company`}
                                className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                              >
                                Confirm
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={exp.company}
                            onChange={(e) => handleExperienceChange(idx, 'company', e.target.value)}
                            data-testid={`review-exp-${idx}-company`}
                            className="w-full px-2.5 py-1 rounded text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                            required
                          />
                        </div>

                        {/* Title */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                              Title
                            </label>
                            {isLowConfidence(`experience.${idx}.title`) && (
                              <span
                                data-testid={`badge-low-conf-experience-${idx}-title`}
                                className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                              >
                                Confirm
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={exp.title}
                            onChange={(e) => handleExperienceChange(idx, 'title', e.target.value)}
                            data-testid={`review-exp-${idx}-title`}
                            className="w-full px-2.5 py-1 rounded text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                            required
                          />
                        </div>

                        {/* Start Date */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                              Start (YYYY or YYYY-MM)
                            </label>
                            {isLowConfidence(`experience.${idx}.start`) && (
                              <span
                                data-testid={`badge-low-conf-experience-${idx}-start`}
                                className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                              >
                                Confirm
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={exp.start || ''}
                            onChange={(e) => handleExperienceChange(idx, 'start', e.target.value)}
                            data-testid={`review-exp-${idx}-start`}
                            placeholder="YYYY-MM"
                            className="w-full px-2.5 py-1 rounded text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                          />
                        </div>

                        {/* End Date */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                              End (or Present)
                            </label>
                            {isLowConfidence(`experience.${idx}.end`) && (
                              <span
                                data-testid={`badge-low-conf-experience-${idx}-end`}
                                className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                              >
                                Confirm
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={exp.current ? 'Present' : exp.end || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (/^present$/i.test(val.trim())) {
                                setResumeData((prev) => {
                                  const updated = [...prev.experience];
                                  if (updated[idx]) {
                                    updated[idx] = { ...updated[idx], current: true, end: null };
                                  }
                                  return { ...prev, experience: updated };
                                });
                              } else {
                                setResumeData((prev) => {
                                  const updated = [...prev.experience];
                                  if (updated[idx]) {
                                    updated[idx] = { ...updated[idx], current: false, end: val || null };
                                  }
                                  return { ...prev, experience: updated };
                                });
                              }
                            }}
                            data-testid={`review-exp-${idx}-end`}
                            placeholder="YYYY-MM"
                            className="w-full px-2.5 py-1 rounded text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                          />
                        </div>
                      </div>

                      {/* Bullets */}
                      <div>
                        <span className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                          Key Achievements / Bullets ({exp.bullets.length})
                        </span>
                        <ul className="space-y-1">
                          {exp.bullets.map((b, bIdx) => (
                            <li key={bIdx} className="text-xs text-zinc-800 dark:text-zinc-200 flex items-start gap-1.5">
                              <span className="text-zinc-400 mt-0.5">•</span>
                              <span className="flex-1">{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 4: Education */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
                4. Education ({resumeData.education.length})
              </h3>
              {resumeData.education.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No education entries extracted.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {resumeData.education.map((edu, idx) => (
                    <div
                      key={edu.id || idx}
                      data-testid={`review-edu-item-${idx}`}
                      className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-2"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                            Institution / School
                          </label>
                          {isLowConfidence(`education.${idx}.school`) && (
                            <span
                              data-testid={`badge-low-conf-education-${idx}-school`}
                              className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                            >
                              Confirm
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={edu.school}
                          onChange={(e) => handleEducationChange(idx, 'school', e.target.value)}
                          data-testid={`review-edu-${idx}-school`}
                          className="w-full px-2.5 py-1 rounded text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                          required
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                            Degree / Field of Study
                          </label>
                          {isLowConfidence(`education.${idx}.degree`) && (
                            <span
                              data-testid={`badge-low-conf-education-${idx}-degree`}
                              className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                            >
                              Confirm
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={edu.degree}
                          onChange={(e) => handleEducationChange(idx, 'degree', e.target.value)}
                          data-testid={`review-edu-${idx}-degree`}
                          className="w-full px-2.5 py-1 rounded text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                          required
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 5: Skills */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
                5. Skills ({resumeData.skills.length} groups)
              </h3>
              {resumeData.skills.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No skills extracted.</p>
              ) : (
                <div className="space-y-2">
                  {resumeData.skills.map((skillGroup, idx) => (
                    <div
                      key={idx}
                      data-testid={`review-skill-group-${idx}`}
                      className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {skillGroup.group}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={skillGroup.items.join(', ')}
                        onChange={(e) => handleSkillsChange(idx, e.target.value)}
                        data-testid={`review-skill-input-${idx}`}
                        className="w-full px-2.5 py-1 rounded text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Modal Actions Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 shrink-0 bg-zinc-50 dark:bg-zinc-900/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            data-testid="review-cancel-btn"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            form="import-review-form"
            disabled={isSaving}
            data-testid="review-confirm-save-btn"
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-xs focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span>Saving to Database...</span>
              </>
            ) : (
              <span>Confirm & Save Resume</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
