import { describe, it, expect, beforeEach } from 'vitest';
import {
  useResumeStore,
  cleanBulletString,
  normalizeResume,
  DEFAULT_RESUME,
} from '@/lib/stores/resume-store';
import type { Resume } from '@/types/resume';
import spikeBasic from '../fixtures/resumes/spike-basic.json';

describe('Resume Store (Zustand-compatible state)', () => {
  beforeEach(() => {
    // Reset store before each test
    useResumeStore.setState({
      resumeId: null,
      title: 'Untitled Resume',
      template: 'standard',
      resume: DEFAULT_RESUME,
      isDirty: false,
      isSaving: false,
      lastSavedAt: null,
      saveStatus: 'idle',
      saveError: null,
    });
  });

  describe('Utility Functions', () => {
    it('cleanBulletString strips leading bullet symbols and leading whitespace', () => {
      expect(cleanBulletString('• Led architectural redesign')).toBe('Led architectural redesign');
      expect(cleanBulletString('- Built high throughput pipeline')).toBe('Built high throughput pipeline');
      expect(cleanBulletString('* Streamlined workflows')).toBe('Streamlined workflows');
      expect(cleanBulletString('   •   Spaced bullet item')).toBe('Spaced bullet item');
      expect(cleanBulletString('Clean string without bullet')).toBe('Clean string without bullet');
    });

    it('normalizeResume ensures all fields conform to defaults', () => {
      const normalized = normalizeResume(null);
      expect(normalized.basics.fullName).toBe('');
      expect(normalized.experience).toEqual([]);
      expect(normalized.summary).toBe('');
    });
  });

  describe('Store Initialization', () => {
    it('initializes resume with provided data and resets isDirty', () => {
      const { initResume } = useResumeStore.getState();

      initResume({
        id: 'test-resume-123',
        title: 'Software Architect Alex',
        template: 'classic',
        content: spikeBasic as unknown as Resume,
      });

      const state = useResumeStore.getState();
      expect(state.resumeId).toBe('test-resume-123');
      expect(state.title).toBe('Software Architect Alex');
      expect(state.template).toBe('classic');
      expect(state.resume.basics.fullName).toBe('Alex Morgan');
      expect(state.resume.experience.length).toBe(2);
      expect(state.isDirty).toBe(false);
      expect(state.saveStatus).toBe('saved');
      expect(state.lastSavedAt).toBeDefined();
    });
  });

  describe('Title & Template Updates', () => {
    it('setTitle updates title and sets isDirty to true', () => {
      const { setTitle } = useResumeStore.getState();
      setTitle('Principal Engineer Resume');

      const state = useResumeStore.getState();
      expect(state.title).toBe('Principal Engineer Resume');
      expect(state.isDirty).toBe(true);
      expect(state.saveStatus).toBe('idle');
    });

    it('setTemplate updates template and sets isDirty to true', () => {
      const { setTemplate } = useResumeStore.getState();
      setTemplate('classic');

      const state = useResumeStore.getState();
      expect(state.template).toBe('classic');
      expect(state.isDirty).toBe(true);
      expect(state.saveStatus).toBe('idle');
    });
  });

  describe('Basics Section & Links', () => {
    it('updateBasics merges contact fields and toggles isDirty', () => {
      const { updateBasics } = useResumeStore.getState();
      updateBasics({
        fullName: 'Jane Developer',
        email: 'jane@example.com',
        location: 'Seattle, WA',
      });

      const state = useResumeStore.getState();
      expect(state.resume.basics.fullName).toBe('Jane Developer');
      expect(state.resume.basics.email).toBe('jane@example.com');
      expect(state.resume.basics.location).toBe('Seattle, WA');
      expect(state.isDirty).toBe(true);
    });

    it('addLink appends links up to a maximum of 5', () => {
      const { addLink } = useResumeStore.getState();

      addLink({ label: 'GitHub', url: 'https://github.com/user' });
      addLink({ label: 'LinkedIn', url: 'https://linkedin.com/in/user' });
      addLink({ label: 'Portfolio', url: 'https://user.dev' });
      addLink({ label: 'Blog', url: 'https://blog.user.dev' });
      addLink({ label: 'Twitter', url: 'https://x.com/user' });
      expect(useResumeStore.getState().resume.basics.links.length).toBe(5);

      // Attempt 6th link
      addLink({ label: 'Substack', url: 'https://user.substack.com' });
      expect(useResumeStore.getState().resume.basics.links.length).toBe(5);
    });

    it('updateLink modifies the link at the specified index', () => {
      const { addLink, updateLink } = useResumeStore.getState();
      addLink({ label: 'GitHub', url: 'https://github.com/user' });

      updateLink(0, { label: 'Code', url: 'https://github.com/newuser' });
      const links = useResumeStore.getState().resume.basics.links;
      expect(links[0]).toEqual({ label: 'Code', url: 'https://github.com/newuser' });
    });

    it('removeLink removes link by index', () => {
      const { addLink, removeLink } = useResumeStore.getState();
      addLink({ label: 'GitHub', url: 'https://github.com/user' });
      addLink({ label: 'LinkedIn', url: 'https://linkedin.com/in/user' });

      removeLink(0);
      const links = useResumeStore.getState().resume.basics.links;
      expect(links.length).toBe(1);
      expect(links[0].label).toBe('LinkedIn');
    });
  });

  describe('Summary Section', () => {
    it('updateSummary updates text and truncates to 600 characters max', () => {
      const { updateSummary } = useResumeStore.getState();
      const longText = 'A'.repeat(700);

      updateSummary(longText);
      const summary = useResumeStore.getState().resume.summary;
      expect(summary.length).toBe(600);
      expect(useResumeStore.getState().isDirty).toBe(true);
    });
  });

  describe('Experience Section & Bullets', () => {
    it('addExperience appends a work experience item', () => {
      const { addExperience } = useResumeStore.getState();
      addExperience({
        company: 'Cloud Corp',
        title: 'Staff Engineer',
        start: '2020-01',
        end: '2023-01',
      });

      const experiences = useResumeStore.getState().resume.experience;
      expect(experiences.length).toBe(1);
      expect(experiences[0].company).toBe('Cloud Corp');
      expect(experiences[0].title).toBe('Staff Engineer');
      expect(experiences[0].id).toBeDefined();
    });

    it('updateExperience clears end date when current role is set to true', () => {
      const { addExperience, updateExperience } = useResumeStore.getState();
      addExperience({
        company: 'Cloud Corp',
        title: 'Staff Engineer',
        start: '2020-01',
        end: '2023-01',
        current: false,
      });

      const expId = useResumeStore.getState().resume.experience[0].id;
      updateExperience(expId, { current: true });

      const updated = useResumeStore.getState().resume.experience[0];
      expect(updated.current).toBe(true);
      expect(updated.end).toBeNull();
    });

    it('reorderExperience swaps work experience items', () => {
      const { addExperience, reorderExperience } = useResumeStore.getState();
      addExperience({ id: 'exp-1', company: 'Company 1' });
      addExperience({ id: 'exp-2', company: 'Company 2' });

      reorderExperience(0, 1);
      const list = useResumeStore.getState().resume.experience;
      expect(list[0].id).toBe('exp-2');
      expect(list[1].id).toBe('exp-1');
    });

    it('enforces maximum 8 bullets per experience entry', () => {
      const { addExperience, addExperienceBullet } = useResumeStore.getState();
      addExperience({ id: 'exp-1', company: 'Company 1', bullets: [] });

      for (let i = 1; i <= 8; i++) {
        addExperienceBullet('exp-1', `Accomplishment #${i}`);
      }
      expect(useResumeStore.getState().resume.experience[0].bullets.length).toBe(8);

      // Attempt 9th bullet
      addExperienceBullet('exp-1', 'Extra accomplishment');
      expect(useResumeStore.getState().resume.experience[0].bullets.length).toBe(8);
    });

    it('updateExperienceBullet strips bullet glyphs and enforces 300 character max', () => {
      const { addExperience, addExperienceBullet, updateExperienceBullet } = useResumeStore.getState();
      addExperience({ id: 'exp-1', bullets: [] });
      addExperienceBullet('exp-1', 'Initial bullet');

      const rawBullet = '•   Architected real-time stream processing system. ' + 'X'.repeat(400);
      updateExperienceBullet('exp-1', 0, rawBullet);

      const bullets = useResumeStore.getState().resume.experience[0].bullets;
      expect(bullets[0].startsWith('•')).toBe(false);
      expect(bullets[0].startsWith('Architected')).toBe(true);
      expect(bullets[0].length).toBe(300);
    });

    it('removeExperienceBullet deletes bullet by index', () => {
      const { addExperience, addExperienceBullet, removeExperienceBullet } = useResumeStore.getState();
      addExperience({ id: 'exp-1', bullets: [] });
      addExperienceBullet('exp-1', 'Bullet 1');
      addExperienceBullet('exp-1', 'Bullet 2');

      removeExperienceBullet('exp-1', 0);
      const bullets = useResumeStore.getState().resume.experience[0].bullets;
      expect(bullets.length).toBe(1);
      expect(bullets[0]).toBe('Bullet 2');
    });
  });

  describe('Education Section', () => {
    it('adds, updates, and removes educational items', () => {
      const { addEducation, updateEducation, removeEducation } = useResumeStore.getState();
      addEducation({ school: 'MIT', degree: 'M.S. in AI' });

      let eduList = useResumeStore.getState().resume.education;
      expect(eduList.length).toBe(1);
      const eduId = eduList[0].id;

      updateEducation(eduId, { start: '2018', end: '2020' });
      eduList = useResumeStore.getState().resume.education;
      expect(eduList[0].start).toBe('2018');
      expect(eduList[0].end).toBe('2020');

      removeEducation(eduId);
      expect(useResumeStore.getState().resume.education.length).toBe(0);
    });
  });

  describe('Skills Section', () => {
    it('adds, updates, and removes skill groups and tag items', () => {
      const {
        addSkillGroup,
        updateSkillGroup,
        addSkillItem,
        removeSkillItem,
        removeSkillGroup,
      } = useResumeStore.getState();

      addSkillGroup('Languages');
      expect(useResumeStore.getState().resume.skills.length).toBe(1);

      updateSkillGroup(0, 'Programming Languages');
      expect(useResumeStore.getState().resume.skills[0].group).toBe('Programming Languages');

      addSkillItem(0, 'TypeScript');
      addSkillItem(0, 'Go');
      // duplicate should be ignored
      addSkillItem(0, 'TypeScript');
      expect(useResumeStore.getState().resume.skills[0].items).toEqual(['TypeScript', 'Go']);

      removeSkillItem(0, 0);
      expect(useResumeStore.getState().resume.skills[0].items).toEqual(['Go']);

      removeSkillGroup(0);
      expect(useResumeStore.getState().resume.skills.length).toBe(0);
    });
  });

  describe('Projects Section', () => {
    it('adds, updates, and limits bullets to 5 per project', () => {
      const {
        addProject,
        updateProject,
        addProjectBullet,
        updateProjectBullet,
        removeProject,
      } = useResumeStore.getState();

      addProject({ name: 'Project A', url: 'https://project-a.org' });
      const projId = useResumeStore.getState().resume.projects[0].id;

      updateProject(projId, { name: 'FlowStream Engine' });
      expect(useResumeStore.getState().resume.projects[0].name).toBe('FlowStream Engine');

      for (let i = 1; i <= 5; i++) {
        addProjectBullet(projId, `Highlight #${i}`);
      }
      expect(useResumeStore.getState().resume.projects[0].bullets.length).toBe(5);

      // Attempt 6th bullet
      addProjectBullet(projId, 'Extra highlight');
      expect(useResumeStore.getState().resume.projects[0].bullets.length).toBe(5);

      updateProjectBullet(projId, 0, '• Cleaned bullet text');
      expect(useResumeStore.getState().resume.projects[0].bullets[0]).toBe('Cleaned bullet text');

      removeProject(projId);
      expect(useResumeStore.getState().resume.projects.length).toBe(0);
    });
  });

  describe('Validation & Save State', () => {
    it('validates a valid resume successfully', () => {
      const { initResume, validate } = useResumeStore.getState();
      initResume({
        id: 'valid-resume',
        title: 'Alex Resume',
        content: spikeBasic as unknown as Resume,
      });

      const result = validate();
      expect(result.isValid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('returns validation error when email is invalid', () => {
      const { initResume, updateBasics, validate } = useResumeStore.getState();
      initResume({
        id: 'test-resume',
        title: 'Draft',
        content: spikeBasic as unknown as Resume,
      });

      updateBasics({ email: 'not-an-email' });
      const result = validate();
      expect(result.isValid).toBe(false);
      expect(result.issues.some((issue) => issue.path.includes('email'))).toBe(true);
    });

    it('tracks saveStatus and markSaved updates state correctly', () => {
      const { setSaveStatus, markSaved } = useResumeStore.getState();

      setSaveStatus('saving');
      expect(useResumeStore.getState().saveStatus).toBe('saving');
      expect(useResumeStore.getState().isSaving).toBe(true);

      setSaveStatus('error', 'Network failure');
      expect(useResumeStore.getState().saveStatus).toBe('error');
      expect(useResumeStore.getState().saveError).toBe('Network failure');
      expect(useResumeStore.getState().isSaving).toBe(false);

      markSaved('2026-10-22T20:00:00.000Z');
      expect(useResumeStore.getState().saveStatus).toBe('saved');
      expect(useResumeStore.getState().isDirty).toBe(false);
      expect(useResumeStore.getState().lastSavedAt).toBe('2026-10-22T20:00:00.000Z');
    });
  });
});
