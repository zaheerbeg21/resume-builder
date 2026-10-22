import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useResumeStore, DEFAULT_RESUME } from '@/lib/stores/resume-store';
import { EditorHeader } from '@/components/editor/EditorHeader';
import { BasicsSection } from '@/components/editor/sections/BasicsSection';
import { SummarySection } from '@/components/editor/sections/SummarySection';
import { ExperienceSection } from '@/components/editor/sections/ExperienceSection';
import { EducationSection } from '@/components/editor/sections/EducationSection';
import { SkillsSection } from '@/components/editor/sections/SkillsSection';
import { ProjectsSection } from '@/components/editor/sections/ProjectsSection';
import type { Resume } from '@/types/resume';
import spikeBasic from '../fixtures/resumes/spike-basic.json';

describe('Editor Components Rendering & Layout', () => {
  beforeEach(() => {
    useResumeStore.setState({
      resumeId: 'test-res-1',
      title: 'Full Stack Engineer',
      template: 'standard',
      resume: DEFAULT_RESUME,
      isDirty: false,
      isSaving: false,
      lastSavedAt: null,
      saveStatus: 'idle',
      saveError: null,
    });
  });

  describe('EditorHeader Component', () => {
    it('renders resume title, template buttons, and back to dashboard link', () => {
      const html = renderToString(React.createElement(EditorHeader));

      expect(html).toContain('Dashboard');
      expect(html).toContain('Full Stack Engineer');
      expect(html).toContain('Standard');
      expect(html).toContain('Classic');
      expect(html).toContain('All changes saved');
    });

    it('renders Saving... state when saveStatus is saving', () => {
      useResumeStore.setState({ saveStatus: 'saving', isSaving: true });
      const html = renderToString(React.createElement(EditorHeader));

      expect(html).toContain('Saving...');
    });

    it('renders Saved indicator when saveStatus is saved', () => {
      useResumeStore.setState({ saveStatus: 'saved', isSaving: false });
      const html = renderToString(React.createElement(EditorHeader));

      expect(html).toContain('Saved');
    });

    it('renders Unsaved changes indicator when dirty', () => {
      useResumeStore.setState({ isDirty: true, saveStatus: 'idle' });
      const html = renderToString(React.createElement(EditorHeader));

      expect(html).toContain('Unsaved changes');
    });

    it('renders Save error and retry button on failure', () => {
      useResumeStore.setState({ saveStatus: 'error', saveError: 'Network timeout' });
      const html = renderToString(
        React.createElement(EditorHeader, { onManualSave: () => {} })
      );

      expect(html).toContain('Save error');
      expect(html).toContain('Retry');
    });
  });

  describe('BasicsSection Component', () => {
    it('renders contact inputs with prefilled values', () => {
      useResumeStore.getState().initResume({
        id: 'test-res-1',
        title: 'Alex Resume',
        content: spikeBasic as unknown as Resume,
      });

      const html = renderToString(React.createElement(BasicsSection));

      expect(html).toContain('Contact &amp; Basics');
      expect(html).toContain('Alex Morgan');
      expect(html).toContain('alex.morgan@example.com');
      expect(html).toContain('San Francisco, CA');
      expect(html).toContain('GitHub');
      expect(html).toContain('Portfolio');
    });
  });

  describe('SummarySection Component', () => {
    it('renders summary textarea and live character counter', () => {
      useResumeStore.getState().initResume({
        id: 'test-res-1',
        title: 'Alex Resume',
        content: spikeBasic as unknown as Resume,
      });

      const html = renderToString(React.createElement(SummarySection));

      expect(html).toContain('Professional Summary');
      expect(html).toContain(spikeBasic.summary);
      expect(html).toContain(`${spikeBasic.summary.length} / 600`);
    });
  });

  describe('ExperienceSection Component', () => {
    it('renders experience cards, company, title, dates, and bullets', () => {
      useResumeStore.getState().initResume({
        id: 'test-res-1',
        title: 'Alex Resume',
        content: spikeBasic as unknown as Resume,
      });

      const html = renderToString(React.createElement(ExperienceSection));

      expect(html).toContain('Work Experience');
      expect(html).toContain('Apex Dynamics Corp');
      expect(html).toContain('Principal Infrastructure Architect');
      expect(html).toContain('Beacon Analytics Lab');
      expect(html).toContain('Architected distributed pipeline');
    });
  });

  describe('EducationSection Component', () => {
    it('renders education institution, degree, and dates', () => {
      useResumeStore.getState().initResume({
        id: 'test-res-1',
        title: 'Alex Resume',
        content: spikeBasic as unknown as Resume,
      });

      const html = renderToString(React.createElement(EducationSection));

      expect(html).toContain('Education');
      expect(html).toContain('University of California, Berkeley');
      expect(html).toContain('Bachelor of Science in Computer Science');
    });
  });

  describe('SkillsSection Component', () => {
    it('renders skill groups and skill tag pills', () => {
      useResumeStore.getState().initResume({
        id: 'test-res-1',
        title: 'Alex Resume',
        content: spikeBasic as unknown as Resume,
      });

      const html = renderToString(React.createElement(SkillsSection));

      expect(html).toContain('Skills &amp; Competencies');
      expect(html).toContain('Languages &amp; Frameworks');
      expect(html).toContain('TypeScript');
      expect(html).toContain('Cloud &amp; Infrastructure');
      expect(html).toContain('Kubernetes');
    });
  });

  describe('ProjectsSection Component', () => {
    it('renders project name, URL, and bullet highlights', () => {
      useResumeStore.getState().initResume({
        id: 'test-res-1',
        title: 'Alex Resume',
        content: spikeBasic as unknown as Resume,
      });

      const html = renderToString(React.createElement(ProjectsSection));

      expect(html).toContain('Key Projects');
      expect(html).toContain('FlowStream Engine');
      expect(html).toContain('https://flowstream.io');
      expect(html).toContain('Open-source workflow engine');
    });
  });
});
