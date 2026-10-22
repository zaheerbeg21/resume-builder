'use client';

import React from 'react';
import { useResumeStore, cleanBulletString } from '@/lib/stores/resume-store';

export const MAX_PROJECT_BULLETS = 5;
export const MAX_PROJECT_BULLET_LENGTH = 300;

export function ProjectsSection() {
  const projects = useResumeStore((state) => state.resume.projects) || [];
  const addProject = useResumeStore((state) => state.addProject);
  const updateProject = useResumeStore((state) => state.updateProject);
  const removeProject = useResumeStore((state) => state.removeProject);
  const addProjectBullet = useResumeStore((state) => state.addProjectBullet);
  const updateProjectBullet = useResumeStore((state) => state.updateProjectBullet);
  const removeProjectBullet = useResumeStore((state) => state.removeProjectBullet);

  const handleAddProject = () => {
    addProject({
      name: '',
      url: undefined,
      bullets: [''],
    });
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 sm:p-6 shadow-xs">
      <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Key Projects
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Highlight open-source work, side projects, or significant initiatives.
          </p>
        </div>

        <button
          type="button"
          data-testid="add-project-btn"
          onClick={handleAddProject}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 transition"
        >
          + Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No projects added yet.
          </p>
          <button
            type="button"
            onClick={handleAddProject}
            className="mt-3 text-xs font-medium text-zinc-900 dark:text-zinc-100 underline hover:no-underline"
          >
            Add your first project
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {projects.map((proj, projIdx) => {
            const bullets = proj.bullets || [];
            const canAddBullet = bullets.length < MAX_PROJECT_BULLETS;

            return (
              <div
                key={proj.id}
                data-testid={`project-card-${projIdx}`}
                className="p-4 sm:p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Project #{projIdx + 1}
                  </span>
                  <button
                    type="button"
                    data-testid={`remove-project-${projIdx}`}
                    onClick={() => removeProject(proj.id)}
                    className="p-1 rounded text-zinc-400 hover:text-rose-500 transition"
                    title="Remove project"
                    aria-label={`Remove project ${proj.name || projIdx + 1}`}
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Project Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      data-testid={`proj-name-input-${projIdx}`}
                      value={proj.name}
                      onChange={(e) => updateProject(proj.id, { name: e.target.value })}
                      placeholder="e.g. OpenSource DevTools"
                      className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Project URL <span className="text-zinc-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="url"
                      data-testid={`proj-url-input-${projIdx}`}
                      value={proj.url ?? ''}
                      onChange={(e) =>
                        updateProject(proj.id, {
                          url: e.target.value.trim() || undefined,
                        })
                      }
                      placeholder="https://github.com/..."
                      className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                </div>

                {/* Project Bullets */}
                <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Project Description & Highlights ({bullets.length}/{MAX_PROJECT_BULLETS})
                    </span>

                    <button
                      type="button"
                      data-testid={`add-project-bullet-${projIdx}`}
                      disabled={!canAddBullet}
                      onClick={() => addProjectBullet(proj.id, '')}
                      className={`text-[11px] font-medium px-2 py-1 rounded border transition ${
                        canAddBullet
                          ? 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          : 'opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800 text-zinc-400'
                      }`}
                    >
                      + Add Highlight
                    </button>
                  </div>

                  <div className="space-y-2">
                    {bullets.map((bullet, bulletIdx) => {
                      const len = bullet.length;
                      const isOverLimit = len > MAX_PROJECT_BULLET_LENGTH;

                      return (
                        <div
                          key={`proj-bullet-${bulletIdx}`}
                          data-testid={`proj-bullet-item-${projIdx}-${bulletIdx}`}
                          className="space-y-1"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-zinc-400 dark:text-zinc-500 text-xs mt-2 select-none">
                              •
                            </span>
                            <div className="flex-1">
                              <textarea
                                rows={2}
                                data-testid={`proj-bullet-input-${projIdx}-${bulletIdx}`}
                                value={bullet}
                                onChange={(e) => {
                                  const sanitized = cleanBulletString(e.target.value);
                                  updateProjectBullet(proj.id, bulletIdx, sanitized);
                                }}
                                placeholder="Engineered high-concurrency ingestion service processing 50k req/s..."
                                className={`w-full text-xs bg-white dark:bg-zinc-800 border rounded-md p-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 transition resize-y ${
                                  isOverLimit
                                    ? 'border-rose-500 focus:ring-rose-500'
                                    : 'border-zinc-300 dark:border-zinc-700'
                                }`}
                              />
                            </div>
                            <button
                              type="button"
                              data-testid={`remove-project-bullet-${projIdx}-${bulletIdx}`}
                              onClick={() => removeProjectBullet(proj.id, bulletIdx)}
                              className="text-zinc-400 hover:text-rose-500 p-1.5 rounded transition mt-0.5"
                              title="Remove bullet"
                              aria-label={`Remove bullet ${bulletIdx + 1}`}
                            >
                              ✕
                            </button>
                          </div>

                          <div className="flex justify-end pr-8">
                            <span
                              className={`text-[10px] font-mono ${
                                isOverLimit
                                  ? 'text-rose-600 dark:text-rose-400 font-bold'
                                  : len >= 260
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-zinc-400 dark:text-zinc-500'
                              }`}
                            >
                              {`${len} / ${MAX_PROJECT_BULLET_LENGTH} chars`}
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
    </section>
  );
}
