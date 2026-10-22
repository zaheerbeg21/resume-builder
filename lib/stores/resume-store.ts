import { useSyncExternalStore } from 'react';
import { type Resume, ResumeSchema } from '@/types/resume';
import { z } from 'zod';

export const DEFAULT_RESUME: Resume = {
  basics: {
    fullName: '',
    headline: '',
    email: '',
    phone: '',
    location: '',
    links: [],
  },
  summary: '',
  experience: [],
  projects: [],
  education: [],
  skills: [],
};

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ResumeStoreState {
  resumeId: string | null;
  title: string;
  template: string;
  resume: Resume;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;

  // Actions
  initResume: (payload: {
    id: string;
    title: string;
    template?: string;
    content: Partial<Resume> | Resume;
  }) => void;
  setTitle: (title: string) => void;
  setTemplate: (template: string) => void;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
  markSaved: (savedAt?: string) => void;
  resetDirty: () => void;

  // Basics
  updateBasics: (patch: Partial<Resume['basics']>) => void;
  addLink: (link?: { label: string; url: string }) => void;
  updateLink: (index: number, patch: Partial<{ label: string; url: string }>) => void;
  removeLink: (index: number) => void;

  // Summary
  updateSummary: (summary: string) => void;

  // Experience
  addExperience: (item?: Partial<Resume['experience'][number]>) => void;
  updateExperience: (id: string, patch: Partial<Resume['experience'][number]>) => void;
  removeExperience: (id: string) => void;
  reorderExperience: (startIndex: number, endIndex: number) => void;
  addExperienceBullet: (expId: string, bullet?: string) => void;
  updateExperienceBullet: (expId: string, bulletIndex: number, text: string) => void;
  removeExperienceBullet: (expId: string, bulletIndex: number) => void;

  // Education
  addEducation: (item?: Partial<Resume['education'][number]>) => void;
  updateEducation: (id: string, patch: Partial<Resume['education'][number]>) => void;
  removeEducation: (id: string) => void;

  // Skills
  addSkillGroup: (groupName?: string) => void;
  updateSkillGroup: (index: number, group: string) => void;
  removeSkillGroup: (index: number) => void;
  addSkillItem: (groupIndex: number, item: string) => void;
  removeSkillItem: (groupIndex: number, itemIndex: number) => void;

  // Projects
  addProject: (item?: Partial<Resume['projects'][number]>) => void;
  updateProject: (id: string, patch: Partial<Resume['projects'][number]>) => void;
  removeProject: (id: string) => void;
  addProjectBullet: (projectId: string, bullet?: string) => void;
  updateProjectBullet: (projectId: string, bulletIndex: number, text: string) => void;
  removeProjectBullet: (projectId: string, bulletIndex: number) => void;

  // Validation
  validate: () => { isValid: boolean; issues: z.ZodIssue[] };
}

/**
 * Strips leading bullet glyphs (•, -, *, ·) and leading whitespace.
 */
export function cleanBulletString(raw: string): string {
  return raw.replace(/^[\s•\-*·]+/, '');
}

/**
 * Normalizes input resume content against ResumeSchema defaults.
 */
export function normalizeResume(raw?: Partial<Resume> | null): Resume {
  if (!raw) return DEFAULT_RESUME;
  return {
    basics: {
      fullName: raw.basics?.fullName ?? '',
      headline: raw.basics?.headline ?? '',
      email: raw.basics?.email ?? '',
      phone: raw.basics?.phone ?? '',
      location: raw.basics?.location ?? '',
      links: Array.isArray(raw.basics?.links) ? raw.basics.links.slice(0, 5) : [],
    },
    summary: (raw.summary ?? '').slice(0, 600),
    experience: Array.isArray(raw.experience)
      ? raw.experience.map((exp, idx) => ({
          id: exp.id || `exp-${idx + 1}-${Date.now()}`,
          company: exp.company ?? '',
          title: exp.title ?? '',
          location: exp.location ?? '',
          start: exp.start ?? null,
          end: exp.current ? null : exp.end ?? null,
          current: Boolean(exp.current),
          bullets: Array.isArray(exp.bullets)
            ? exp.bullets.slice(0, 8).map((b) => cleanBulletString(b).slice(0, 300))
            : [],
        }))
      : [],
    projects: Array.isArray(raw.projects)
      ? raw.projects.map((proj, idx) => ({
          id: proj.id || `proj-${idx + 1}-${Date.now()}`,
          name: proj.name ?? '',
          url: proj.url || undefined,
          bullets: Array.isArray(proj.bullets)
            ? proj.bullets.slice(0, 5).map((b) => cleanBulletString(b).slice(0, 300))
            : [],
        }))
      : [],
    education: Array.isArray(raw.education)
      ? raw.education.map((edu, idx) => ({
          id: edu.id || `edu-${idx + 1}-${Date.now()}`,
          school: edu.school ?? '',
          degree: edu.degree ?? '',
          start: edu.start ?? null,
          end: edu.end ?? null,
        }))
      : [],
    skills: Array.isArray(raw.skills)
      ? raw.skills.map((grp) => ({
          group: grp.group ?? '',
          items: Array.isArray(grp.items) ? grp.items.map((i) => i.trim()).filter(Boolean) : [],
        }))
      : [],
  };
}

// Internal store implementation using subscriber pattern
type Listener = () => void;

function createResumeStore() {
  const listeners = new Set<Listener>();

  let state: ResumeStoreState = {
    resumeId: null,
    title: 'Untitled Resume',
    template: 'standard',
    resume: DEFAULT_RESUME,
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    saveStatus: 'idle',
    saveError: null,

    initResume: ({ id, title, template, content }) => {
      const normalized = normalizeResume(content);
      setState({
        resumeId: id,
        title: title || 'Untitled Resume',
        template: template || 'standard',
        resume: normalized,
        isDirty: false,
        isSaving: false,
        lastSavedAt: new Date().toISOString(),
        saveStatus: 'saved',
        saveError: null,
      });
    },

    setTitle: (title) => {
      setState({ title, isDirty: true, saveStatus: 'idle' });
    },

    setTemplate: (template) => {
      setState({ template, isDirty: true, saveStatus: 'idle' });
    },

    setSaveStatus: (saveStatus, saveError = null) => {
      setState({
        saveStatus,
        saveError,
        isSaving: saveStatus === 'saving',
      });
    },

    markSaved: (savedAt) => {
      setState({
        isDirty: false,
        isSaving: false,
        saveStatus: 'saved',
        saveError: null,
        lastSavedAt: savedAt ?? new Date().toISOString(),
      });
    },

    resetDirty: () => {
      setState({ isDirty: false });
    },

    // Basics
    updateBasics: (patch) => {
      setState((prev) => ({
        resume: {
          ...prev.resume,
          basics: {
            ...prev.resume.basics,
            ...patch,
          },
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    addLink: (link = { label: '', url: '' }) => {
      setState((prev) => {
        if (prev.resume.basics.links.length >= 5) return prev;
        return {
          resume: {
            ...prev.resume,
            basics: {
              ...prev.resume.basics,
              links: [...prev.resume.basics.links, link],
            },
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    updateLink: (index, patch) => {
      setState((prev) => {
        const nextLinks = [...prev.resume.basics.links];
        if (index < 0 || index >= nextLinks.length) return prev;
        nextLinks[index] = { ...nextLinks[index], ...patch };
        return {
          resume: {
            ...prev.resume,
            basics: {
              ...prev.resume.basics,
              links: nextLinks,
            },
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    removeLink: (index) => {
      setState((prev) => {
        const nextLinks = prev.resume.basics.links.filter((_, i) => i !== index);
        return {
          resume: {
            ...prev.resume,
            basics: {
              ...prev.resume.basics,
              links: nextLinks,
            },
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    // Summary
    updateSummary: (rawSummary) => {
      const summary = rawSummary.slice(0, 600);
      setState((prev) => ({
        resume: {
          ...prev.resume,
          summary,
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    // Experience
    addExperience: (item) => {
      const newItem: Resume['experience'][number] = {
        id: item?.id || `exp-${Date.now()}`,
        company: item?.company ?? '',
        title: item?.title ?? '',
        location: item?.location ?? '',
        start: item?.start ?? null,
        end: item?.current ? null : item?.end ?? null,
        current: Boolean(item?.current),
        bullets: item?.bullets ?? [],
      };
      setState((prev) => ({
        resume: {
          ...prev.resume,
          experience: [...prev.resume.experience, newItem],
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    updateExperience: (id, patch) => {
      setState((prev) => {
        const nextExperience = prev.resume.experience.map((exp) => {
          if (exp.id !== id) return exp;
          const merged = { ...exp, ...patch };
          if (merged.current) {
            merged.end = null;
          }
          return merged;
        });
        return {
          resume: {
            ...prev.resume,
            experience: nextExperience,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    removeExperience: (id) => {
      setState((prev) => ({
        resume: {
          ...prev.resume,
          experience: prev.resume.experience.filter((exp) => exp.id !== id),
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    reorderExperience: (startIndex, endIndex) => {
      setState((prev) => {
        const list = [...prev.resume.experience];
        if (
          startIndex < 0 ||
          startIndex >= list.length ||
          endIndex < 0 ||
          endIndex >= list.length ||
          startIndex === endIndex
        ) {
          return prev;
        }
        const [moved] = list.splice(startIndex, 1);
        list.splice(endIndex, 0, moved);
        return {
          resume: {
            ...prev.resume,
            experience: list,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    addExperienceBullet: (expId, bullet = '') => {
      setState((prev) => {
        const nextExp = prev.resume.experience.map((exp) => {
          if (exp.id !== expId) return exp;
          if (exp.bullets.length >= 8) return exp;
          const cleaned = cleanBulletString(bullet).slice(0, 300);
          return {
            ...exp,
            bullets: [...exp.bullets, cleaned],
          };
        });
        return {
          resume: {
            ...prev.resume,
            experience: nextExp,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    updateExperienceBullet: (expId, bulletIndex, text) => {
      setState((prev) => {
        const cleaned = cleanBulletString(text).slice(0, 300);
        const nextExp = prev.resume.experience.map((exp) => {
          if (exp.id !== expId) return exp;
          const bullets = [...exp.bullets];
          if (bulletIndex < 0 || bulletIndex >= bullets.length) return exp;
          bullets[bulletIndex] = cleaned;
          return {
            ...exp,
            bullets,
          };
        });
        return {
          resume: {
            ...prev.resume,
            experience: nextExp,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    removeExperienceBullet: (expId, bulletIndex) => {
      setState((prev) => {
        const nextExp = prev.resume.experience.map((exp) => {
          if (exp.id !== expId) return exp;
          return {
            ...exp,
            bullets: exp.bullets.filter((_, idx) => idx !== bulletIndex),
          };
        });
        return {
          resume: {
            ...prev.resume,
            experience: nextExp,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    // Education
    addEducation: (item) => {
      const newItem: Resume['education'][number] = {
        id: item?.id || `edu-${Date.now()}`,
        school: item?.school ?? '',
        degree: item?.degree ?? '',
        start: item?.start ?? null,
        end: item?.end ?? null,
      };
      setState((prev) => ({
        resume: {
          ...prev.resume,
          education: [...prev.resume.education, newItem],
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    updateEducation: (id, patch) => {
      setState((prev) => {
        const nextEdu = prev.resume.education.map((edu) =>
          edu.id === id ? { ...edu, ...patch } : edu
        );
        return {
          resume: {
            ...prev.resume,
            education: nextEdu,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    removeEducation: (id) => {
      setState((prev) => ({
        resume: {
          ...prev.resume,
          education: prev.resume.education.filter((edu) => edu.id !== id),
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    // Skills
    addSkillGroup: (groupName = 'New Skill Group') => {
      setState((prev) => ({
        resume: {
          ...prev.resume,
          skills: [...prev.resume.skills, { group: groupName, items: [] }],
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    updateSkillGroup: (index, group) => {
      setState((prev) => {
        const nextSkills = [...prev.resume.skills];
        if (index < 0 || index >= nextSkills.length) return prev;
        nextSkills[index] = { ...nextSkills[index], group };
        return {
          resume: {
            ...prev.resume,
            skills: nextSkills,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    removeSkillGroup: (index) => {
      setState((prev) => ({
        resume: {
          ...prev.resume,
          skills: prev.resume.skills.filter((_, i) => i !== index),
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    addSkillItem: (groupIndex, item) => {
      const trimmed = item.trim();
      if (!trimmed) return;
      setState((prev) => {
        const nextSkills = [...prev.resume.skills];
        if (groupIndex < 0 || groupIndex >= nextSkills.length) return prev;
        const currentGroup = nextSkills[groupIndex];
        if (currentGroup.items.includes(trimmed)) return prev;
        nextSkills[groupIndex] = {
          ...currentGroup,
          items: [...currentGroup.items, trimmed],
        };
        return {
          resume: {
            ...prev.resume,
            skills: nextSkills,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    removeSkillItem: (groupIndex, itemIndex) => {
      setState((prev) => {
        const nextSkills = [...prev.resume.skills];
        if (groupIndex < 0 || groupIndex >= nextSkills.length) return prev;
        const currentGroup = nextSkills[groupIndex];
        nextSkills[groupIndex] = {
          ...currentGroup,
          items: currentGroup.items.filter((_, i) => i !== itemIndex),
        };
        return {
          resume: {
            ...prev.resume,
            skills: nextSkills,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    // Projects
    addProject: (item) => {
      const newItem: Resume['projects'][number] = {
        id: item?.id || `proj-${Date.now()}`,
        name: item?.name ?? '',
        url: item?.url || undefined,
        bullets: item?.bullets ?? [],
      };
      setState((prev) => ({
        resume: {
          ...prev.resume,
          projects: [...prev.resume.projects, newItem],
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    updateProject: (id, patch) => {
      setState((prev) => {
        const nextProjects = prev.resume.projects.map((proj) =>
          proj.id === id ? { ...proj, ...patch } : proj
        );
        return {
          resume: {
            ...prev.resume,
            projects: nextProjects,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    removeProject: (id) => {
      setState((prev) => ({
        resume: {
          ...prev.resume,
          projects: prev.resume.projects.filter((proj) => proj.id !== id),
        },
        isDirty: true,
        saveStatus: 'idle',
      }));
    },

    addProjectBullet: (projectId, bullet = '') => {
      setState((prev) => {
        const nextProjects = prev.resume.projects.map((proj) => {
          if (proj.id !== projectId) return proj;
          if (proj.bullets.length >= 5) return proj;
          const cleaned = cleanBulletString(bullet).slice(0, 300);
          return {
            ...proj,
            bullets: [...proj.bullets, cleaned],
          };
        });
        return {
          resume: {
            ...prev.resume,
            projects: nextProjects,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    updateProjectBullet: (projectId, bulletIndex, text) => {
      setState((prev) => {
        const cleaned = cleanBulletString(text).slice(0, 300);
        const nextProjects = prev.resume.projects.map((proj) => {
          if (proj.id !== projectId) return proj;
          const bullets = [...proj.bullets];
          if (bulletIndex < 0 || bulletIndex >= bullets.length) return proj;
          bullets[bulletIndex] = cleaned;
          return {
            ...proj,
            bullets,
          };
        });
        return {
          resume: {
            ...prev.resume,
            projects: nextProjects,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    removeProjectBullet: (projectId, bulletIndex) => {
      setState((prev) => {
        const nextProjects = prev.resume.projects.map((proj) => {
          if (proj.id !== projectId) return proj;
          return {
            ...proj,
            bullets: proj.bullets.filter((_, idx) => idx !== bulletIndex),
          };
        });
        return {
          resume: {
            ...prev.resume,
            projects: nextProjects,
          },
          isDirty: true,
          saveStatus: 'idle',
        };
      });
    },

    // Validation
    validate: () => {
      const currentResume = state.resume;
      const result = ResumeSchema.safeParse(currentResume);
      if (result.success) {
        return { isValid: true, issues: [] };
      }
      return { isValid: false, issues: result.error.issues };
    },
  };

  const getState = () => state;

  const setState = (
    partial:
      | Partial<ResumeStoreState>
      | ((prevState: ResumeStoreState) => Partial<ResumeStoreState>)
  ) => {
    const nextState =
      typeof partial === 'function' ? partial(state) : partial;
    if (nextState !== state) {
      state = Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener());
    }
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  // React hook binding
  const useStore = <T,>(selector: (state: ResumeStoreState) => T = (s) => s as unknown as T): T => {
    return useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(state)
    );
  };

  Object.assign(useStore, {
    getState,
    setState,
    subscribe,
  });

  return useStore as typeof useStore & {
    getState: typeof getState;
    setState: typeof setState;
    subscribe: typeof subscribe;
  };
}

export const useResumeStore = createResumeStore();
