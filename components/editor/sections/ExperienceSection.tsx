'use client';

import React, { useState } from 'react';
import { useResumeStore, cleanBulletString } from '@/lib/stores/resume-store';
import { BulletImproverModal } from '../BulletImproverModal';

export const MAX_BULLETS_PER_EXPERIENCE = 8;
export const MAX_BULLET_LENGTH = 300;

export function ExperienceSection() {
  const experience = useResumeStore((state) => state.resume.experience) || [];
  const addExperience = useResumeStore((state) => state.addExperience);
  const updateExperience = useResumeStore((state) => state.updateExperience);
  const removeExperience = useResumeStore((state) => state.removeExperience);
  const reorderExperience = useResumeStore((state) => state.reorderExperience);
  const addExperienceBullet = useResumeStore((state) => state.addExperienceBullet);
  const updateExperienceBullet = useResumeStore((state) => state.updateExperienceBullet);
  const removeExperienceBullet = useResumeStore((state) => state.removeExperienceBullet);

  const [improverModalState, setImproverModalState] = useState<{
    isOpen: boolean;
    expId: string;
    bulletIndex: number;
    initialBullet: string;
    roleTitle: string;
    isCurrentRole: boolean;
  } | null>(null);

  const handleOpenImprover = (
    exp: (typeof experience)[number],
    bulletIdx: number
  ) => {
    setImproverModalState({
      isOpen: true,
      expId: exp.id,
      bulletIndex: bulletIdx,
      initialBullet: exp.bullets[bulletIdx] || '',
      roleTitle: exp.title,
      isCurrentRole: Boolean(exp.current),
    });
  };

  const handleApplyImprovedBullet = (newBulletText: string) => {
    if (!improverModalState) return;
    updateExperienceBullet(
      improverModalState.expId,
      improverModalState.bulletIndex,
      newBulletText
    );
  };

  const handleAddPosition = () => {
    addExperience({
      company: '',
      title: '',
      location: '',
      start: null,
      end: null,
      current: false,
      bullets: [''],
    });
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 sm:p-6 shadow-xs">
      <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Work Experience
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Add relevant roles, employment dates, and key accomplishments.
          </p>
        </div>

        <button
          type="button"
          data-testid="add-experience-btn"
          onClick={handleAddPosition}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 transition"
        >
          + Add Position
        </button>
      </div>

      {experience.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No work experience added yet.
          </p>
          <button
            type="button"
            onClick={handleAddPosition}
            className="mt-3 text-xs font-medium text-zinc-900 dark:text-zinc-100 underline hover:no-underline"
          >
            Add your first role
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {experience.map((exp, expIdx) => {
            const bullets = exp.bullets || [];
            const canAddBullet = bullets.length < MAX_BULLETS_PER_EXPERIENCE;

            return (
              <div
                key={exp.id}
                data-testid={`experience-card-${expIdx}`}
                className="p-4 sm:p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-4"
              >
                {/* Header: Title / Actions */}
                <div className="flex items-center justify-between gap-2 border-b border-zinc-200/60 dark:border-zinc-800 pb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Role #{expIdx + 1}
                  </span>

                  <div className="flex items-center gap-1">
                    {/* Reorder Buttons */}
                    <button
                      type="button"
                      data-testid={`exp-move-up-${expIdx}`}
                      disabled={expIdx === 0}
                      onClick={() => reorderExperience(expIdx, expIdx - 1)}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      title="Move up"
                      aria-label="Move position up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      data-testid={`exp-move-down-${expIdx}`}
                      disabled={expIdx === experience.length - 1}
                      onClick={() => reorderExperience(expIdx, expIdx + 1)}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      title="Move down"
                      aria-label="Move position down"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      data-testid={`remove-experience-${expIdx}`}
                      onClick={() => removeExperience(exp.id)}
                      className="p-1 rounded text-zinc-400 hover:text-rose-500 transition ml-1"
                      title="Remove role"
                      aria-label={`Remove position ${expIdx + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Company & Job Title */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Company Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      data-testid={`exp-company-input-${expIdx}`}
                      value={exp.company}
                      onChange={(e) => updateExperience(exp.id, { company: e.target.value })}
                      placeholder="e.g. Acme Corp"
                      className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Job Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      data-testid={`exp-title-input-${expIdx}`}
                      value={exp.title}
                      onChange={(e) => updateExperience(exp.id, { title: e.target.value })}
                      placeholder="e.g. Senior Software Engineer"
                      className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                </div>

                {/* Location, Dates, Current Role Toggle */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      data-testid={`exp-location-input-${expIdx}`}
                      value={exp.location ?? ''}
                      onChange={(e) => updateExperience(exp.id, { location: e.target.value })}
                      placeholder="e.g. New York, NY (or Remote)"
                      className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Start Date <span className="text-zinc-400 font-normal">(YYYY or YYYY-MM)</span>
                    </label>
                    <input
                      type="text"
                      data-testid={`exp-start-input-${expIdx}`}
                      value={exp.start ?? ''}
                      onChange={(e) =>
                        updateExperience(exp.id, {
                          start: e.target.value.trim() ? e.target.value.trim() : null,
                        })
                      }
                      placeholder="2021-06"
                      className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        End Date
                      </label>
                      <label className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400 cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid={`exp-current-checkbox-${expIdx}`}
                          checked={Boolean(exp.current)}
                          onChange={(e) => {
                            const isCurrent = e.target.checked;
                            updateExperience(exp.id, {
                              current: isCurrent,
                              end: isCurrent ? null : exp.end,
                            });
                          }}
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 h-3.5 w-3.5"
                        />
                        Current
                      </label>
                    </div>
                    <input
                      type="text"
                      data-testid={`exp-end-input-${expIdx}`}
                      disabled={Boolean(exp.current)}
                      value={exp.current ? 'Present' : exp.end ?? ''}
                      onChange={(e) =>
                        updateExperience(exp.id, {
                          end: e.target.value.trim() ? e.target.value.trim() : null,
                        })
                      }
                      placeholder="2023-12"
                      className={`w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 ${
                        exp.current ? 'opacity-60 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800/80' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Bullet Points Manager */}
                <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Key Accomplishments & Bullets ({bullets.length}/{MAX_BULLETS_PER_EXPERIENCE})
                    </span>

                    <button
                      type="button"
                      data-testid={`add-bullet-${expIdx}`}
                      disabled={!canAddBullet}
                      onClick={() => addExperienceBullet(exp.id, '')}
                      className={`text-[11px] font-medium px-2 py-1 rounded border transition ${
                        canAddBullet
                          ? 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          : 'opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800 text-zinc-400'
                      }`}
                    >
                      + Add Bullet
                    </button>
                  </div>

                  <div className="space-y-2">
                    {bullets.map((bullet, bulletIdx) => {
                      const len = bullet.length;
                      const isOverLimit = len > MAX_BULLET_LENGTH;

                      return (
                        <div
                          key={`bullet-${bulletIdx}`}
                          data-testid={`bullet-item-${expIdx}-${bulletIdx}`}
                          className="space-y-1"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-zinc-400 dark:text-zinc-500 text-xs mt-2 select-none">
                              •
                            </span>
                            <div className="flex-1">
                              <textarea
                                rows={2}
                                data-testid={`bullet-input-${expIdx}-${bulletIdx}`}
                                value={bullet}
                                onChange={(e) => {
                                  const sanitized = cleanBulletString(e.target.value);
                                  updateExperienceBullet(exp.id, bulletIdx, sanitized);
                                }}
                                placeholder="Lead cross-functional team delivering 30% reduction in query latency..."
                                className={`w-full text-xs bg-white dark:bg-zinc-800 border rounded-md p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 transition resize-y ${
                                  isOverLimit
                                    ? 'border-rose-500 focus:ring-rose-500'
                                    : 'border-zinc-300 dark:border-zinc-700'
                                }`}
                              />
                            </div>
                            <button
                              type="button"
                              data-testid={`remove-bullet-${expIdx}-${bulletIdx}`}
                              onClick={() => removeExperienceBullet(exp.id, bulletIdx)}
                              className="text-zinc-400 hover:text-rose-500 p-1.5 rounded transition mt-0.5"
                              title="Remove bullet"
                              aria-label={`Remove bullet ${bulletIdx + 1}`}
                            >
                              ✕
                            </button>
                          </div>

                          <div className="flex justify-between items-center pr-8">
                            <button
                              type="button"
                              data-testid={`improve-bullet-${expIdx}-${bulletIdx}`}
                              onClick={() => handleOpenImprover(exp, bulletIdx)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition"
                            >
                              <span>✨ Improve with AI</span>
                            </button>

                            <span
                              className={`text-[10px] font-mono ${
                                isOverLimit
                                  ? 'text-rose-600 dark:text-rose-400 font-bold'
                                  : len >= 260
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-zinc-400 dark:text-zinc-500'
                              }`}
                            >
                              {`${len} / ${MAX_BULLET_LENGTH} chars`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {improverModalState && (
        <BulletImproverModal
          key={`${improverModalState.expId}-${improverModalState.bulletIndex}`}
          isOpen={improverModalState.isOpen}
          onClose={() => setImproverModalState(null)}
          initialBullet={improverModalState.initialBullet}
          roleTitle={improverModalState.roleTitle}
          isCurrentRole={improverModalState.isCurrentRole}
          onApply={handleApplyImprovedBullet}
        />
      )}
    </section>
  );
}

