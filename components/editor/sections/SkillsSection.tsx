'use client';

import React, { useState } from 'react';
import { useResumeStore } from '@/lib/stores/resume-store';

export function SkillsSection() {
  const skills = useResumeStore((state) => state.resume.skills) || [];
  const addSkillGroup = useResumeStore((state) => state.addSkillGroup);
  const updateSkillGroup = useResumeStore((state) => state.updateSkillGroup);
  const removeSkillGroup = useResumeStore((state) => state.removeSkillGroup);
  const addSkillItem = useResumeStore((state) => state.addSkillItem);
  const removeSkillItem = useResumeStore((state) => state.removeSkillItem);

  // Local state for pending tag inputs per group
  const [tagInputs, setTagInputs] = useState<Record<number, string>>({});

  const handleAddTag = (groupIdx: number) => {
    const raw = tagInputs[groupIdx] || '';
    const trimmed = raw.trim();
    if (trimmed) {
      addSkillItem(groupIdx, trimmed);
      setTagInputs((prev) => ({ ...prev, [groupIdx]: '' }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, groupIdx: number) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(groupIdx);
    }
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 sm:p-6 shadow-xs">
      <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Skills & Competencies
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Group your technical proficiencies (e.g. Languages, Cloud, Frameworks).
          </p>
        </div>

        <button
          type="button"
          data-testid="add-skill-group-btn"
          onClick={() => addSkillGroup('New Skill Group')}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 transition"
        >
          + Add Group
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No skill groups added yet.
          </p>
          <button
            type="button"
            onClick={() => addSkillGroup('Languages & Frameworks')}
            className="mt-3 text-xs font-medium text-zinc-900 dark:text-zinc-100 underline hover:no-underline"
          >
            Add your first skill group
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {skills.map((grp, grpIdx) => (
            <div
              key={`skill-grp-${grpIdx}`}
              data-testid={`skill-group-${grpIdx}`}
              className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-3"
            >
              {/* Group Header & Name Input */}
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  data-testid={`skill-group-name-${grpIdx}`}
                  value={grp.group}
                  onChange={(e) => updateSkillGroup(grpIdx, e.target.value)}
                  placeholder="e.g. Programming Languages"
                  className="font-medium text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-1.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 flex-1 max-w-xs"
                />

                <button
                  type="button"
                  data-testid={`remove-skill-group-${grpIdx}`}
                  onClick={() => removeSkillGroup(grpIdx)}
                  className="text-zinc-400 hover:text-rose-500 p-1.5 rounded transition"
                  title="Remove skill group"
                  aria-label={`Remove skill group ${grp.group || grpIdx + 1}`}
                >
                  ✕
                </button>
              </div>

              {/* Tag Pills List */}
              <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
                {grp.items.map((item, itemIdx) => (
                  <span
                    key={`item-${itemIdx}`}
                    data-testid={`skill-pill-${grpIdx}-${itemIdx}`}
                    className="inline-flex items-center gap-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 px-2.5 py-1 rounded-full shadow-2xs font-medium"
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      data-testid={`remove-skill-item-${grpIdx}-${itemIdx}`}
                      onClick={() => removeSkillItem(grpIdx, itemIdx)}
                      className="text-zinc-400 hover:text-rose-500 transition -mr-0.5 ml-0.5"
                      aria-label={`Remove skill ${item}`}
                    >
                      ×
                    </button>
                  </span>
                ))}

                {grp.items.length === 0 && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 italic py-1">
                    No skills in this group yet. Add tags below.
                  </span>
                )}
              </div>

              {/* Add Tag Input */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  data-testid={`skill-tag-input-${grpIdx}`}
                  value={tagInputs[grpIdx] || ''}
                  onChange={(e) =>
                    setTagInputs((prev) => ({ ...prev, [grpIdx]: e.target.value }))
                  }
                  onKeyDown={(e) => handleKeyDown(e, grpIdx)}
                  placeholder="Type skill & press Enter (e.g. TypeScript)..."
                  className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-1.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 flex-1 sm:max-w-xs"
                />
                <button
                  type="button"
                  data-testid={`skill-tag-add-btn-${grpIdx}`}
                  onClick={() => handleAddTag(grpIdx)}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  Add Tag
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
