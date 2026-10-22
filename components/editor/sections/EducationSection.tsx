'use client';

import React from 'react';
import { useResumeStore } from '@/lib/stores/resume-store';

export function EducationSection() {
  const education = useResumeStore((state) => state.resume.education) || [];
  const addEducation = useResumeStore((state) => state.addEducation);
  const updateEducation = useResumeStore((state) => state.updateEducation);
  const removeEducation = useResumeStore((state) => state.removeEducation);

  const handleAddEducation = () => {
    addEducation({
      school: '',
      degree: '',
      start: null,
      end: null,
    });
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 sm:p-6 shadow-xs">
      <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Education
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Add your degrees, institutions, and dates of study.
          </p>
        </div>

        <button
          type="button"
          data-testid="add-education-btn"
          onClick={handleAddEducation}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 transition"
        >
          + Add Education
        </button>
      </div>

      {education.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No education entries added yet.
          </p>
          <button
            type="button"
            onClick={handleAddEducation}
            className="mt-3 text-xs font-medium text-zinc-900 dark:text-zinc-100 underline hover:no-underline"
          >
            Add an institution
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {education.map((edu, eduIdx) => (
            <div
              key={edu.id}
              data-testid={`education-card-${eduIdx}`}
              className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Institution #{eduIdx + 1}
                </span>
                <button
                  type="button"
                  data-testid={`remove-education-${eduIdx}`}
                  onClick={() => removeEducation(edu.id)}
                  className="p-1 rounded text-zinc-400 hover:text-rose-500 transition"
                  title="Remove education"
                  aria-label={`Remove education ${eduIdx + 1}`}
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    School / University <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    data-testid={`edu-school-input-${eduIdx}`}
                    value={edu.school}
                    onChange={(e) => updateEducation(edu.id, { school: e.target.value })}
                    placeholder="e.g. Stanford University"
                    className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Degree & Major <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    data-testid={`edu-degree-input-${eduIdx}`}
                    value={edu.degree}
                    onChange={(e) => updateEducation(edu.id, { degree: e.target.value })}
                    placeholder="e.g. B.S. in Computer Science"
                    className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Start Date <span className="text-zinc-400 font-normal">(YYYY or YYYY-MM)</span>
                  </label>
                  <input
                    type="text"
                    data-testid={`edu-start-input-${eduIdx}`}
                    value={edu.start ?? ''}
                    onChange={(e) =>
                      updateEducation(edu.id, {
                        start: e.target.value.trim() ? e.target.value.trim() : null,
                      })
                    }
                    placeholder="2016-09"
                    className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    End Date / Graduation <span className="text-zinc-400 font-normal">(YYYY or YYYY-MM)</span>
                  </label>
                  <input
                    type="text"
                    data-testid={`edu-end-input-${eduIdx}`}
                    value={edu.end ?? ''}
                    onChange={(e) =>
                      updateEducation(edu.id, {
                        end: e.target.value.trim() ? e.target.value.trim() : null,
                      })
                    }
                    placeholder="2020-05"
                    className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
