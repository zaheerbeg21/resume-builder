import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  Navbar,
  HeroSection,
  FreeAtsChecker,
  ComparisonTable,
  PricingSection,
  Footer,
  SAMPLE_ENGINEER_RESUME,
  SAMPLE_ENGINEER_JD,
  parseClientResumeText,
  parseClientJdText,
} from '@/components/marketing';
import Home from '@/app/page';
import { scoreResume } from '@/lib/scoring/match';

describe('Landing Page & Marketing Components', () => {
  describe('Navbar Component', () => {
    it('renders brand identity and anchor links', () => {
      const html = renderToString(React.createElement(Navbar));

      expect(html).toContain('ATS Resume Builder');
      expect(html).toContain('Shows Its Work');
      expect(html).toContain('href="#features"');
      expect(html).toContain('href="#ats-checker"');
      expect(html).toContain('href="#comparison"');
      expect(html).toContain('href="#pricing"');
    });

    it('renders navigation CTAs linking to /login and /register', () => {
      const html = renderToString(React.createElement(Navbar));

      expect(html).toContain('href="/login"');
      expect(html).toContain('href="/register"');
      expect(html).toContain('Sign In');
      expect(html).toContain('Build Free Resume');
    });
  });

  describe('HeroSection Component', () => {
    it('renders the core positioning headline and subtitle', () => {
      const html = renderToString(React.createElement(HeroSection));

      expect(html).toContain('The resume builder that');
      expect(html).toContain('shows its work.');
      expect(html).toContain('Export real-text, single-column PDFs');
      expect(html).toContain('never invents facts');
    });

    it('renders primary CTAs linking to registration, login, and checker sandbox', () => {
      const html = renderToString(React.createElement(HeroSection));

      expect(html).toContain('data-testid="hero-cta-register"');
      expect(html).toContain('href="/register"');
      expect(html).toContain('Build Free Resume');

      expect(html).toContain('data-testid="hero-cta-login"');
      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign In');

      expect(html).toContain('data-testid="hero-cta-checker"');
      expect(html).toContain('href="#ats-checker"');
      expect(html).toContain('Try Free ATS Checker');
    });

    it('renders trust badges highlighting core product pillars', () => {
      const html = renderToString(React.createElement(HeroSection));

      expect(html).toContain('100% ATS Verified');
      expect(html).toContain('Honest AI Engine');
      expect(html).toContain('Explainable Score');
      expect(html).toContain('No Subscriptions');
    });
  });

  describe('FreeAtsChecker Component & Scoring Sandbox', () => {
    it('renders initial sandbox with score card, textareas, and conversion CTA', () => {
      const html = renderToString(React.createElement(FreeAtsChecker));

      expect(html).toContain('data-testid="ats-checker-score-card"');
      expect(html).toContain('data-testid="live-match-score"');
      expect(html).toContain('data-testid="sandbox-resume-textarea"');
      expect(html).toContain('data-testid="sandbox-jd-textarea"');
      expect(html).toContain('data-testid="checker-cta-button"');
      expect(html).toContain('href="/register"');
    });

    it('renders the three-part score breakdown (Coverage /80, Title /10, Format /10)', () => {
      const html = renderToString(React.createElement(FreeAtsChecker));

      expect(html).toContain('data-testid="breakdown-coverage"');
      expect(html).toContain('/ 80 pts');

      expect(html).toContain('data-testid="breakdown-title"');
      expect(html).toContain('/ 10 pts');

      expect(html).toContain('data-testid="breakdown-format"');
      expect(html).toContain('/ 10 pts');
    });

    it('executes client-side parseClientResumeText correctly', () => {
      const resume = parseClientResumeText(SAMPLE_ENGINEER_RESUME);

      expect(resume.basics.fullName).toBe('Alex Rivera');
      expect(resume.basics.headline).toBe('Senior Full-Stack Engineer');
      expect(resume.basics.email).toBe('alex.rivera@example.com');
      expect(resume.experience.length).toBeGreaterThan(0);
      expect(resume.skills.length).toBeGreaterThan(0);
      expect(resume.skills[0].items).toContain('TypeScript');
      expect(resume.skills[0].items).toContain('React');
    });

    it('executes client-side parseClientJdText correctly', () => {
      const jd = parseClientJdText(SAMPLE_ENGINEER_JD);

      expect(jd.job_title).toContain('Senior Software Engineer');
      const keywordTerms = jd.keywords.map((k) => k.term);
      expect(keywordTerms).toContain('TypeScript');
      expect(keywordTerms).toContain('React');
      expect(keywordTerms).toContain('Node.js');
      expect(keywordTerms).toContain('Docker');
    });

    it('computes realistic score on default engineer fixtures via scoreResume()', () => {
      const resume = parseClientResumeText(SAMPLE_ENGINEER_RESUME);
      const jd = parseClientJdText(SAMPLE_ENGINEER_JD);
      const result = scoreResume(resume, jd, 1.0);

      // Strong match expected for the tailored sample
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.breakdown.coverage).toBeGreaterThan(50);
      expect(result.breakdown.title).toBeGreaterThanOrEqual(5);
      expect(result.breakdown.format).toBe(10);
      expect(result.keywords.some((k) => k.found && k.term === 'TypeScript')).toBe(true);
    });

    it('detects and caps keyword stuffing in match calculation', () => {
      const stuffedResumeText = `${SAMPLE_ENGINEER_RESUME}\nTypeScript TypeScript TypeScript TypeScript TypeScript TypeScript`;
      const resume = parseClientResumeText(stuffedResumeText);
      const jd = parseClientJdText(SAMPLE_ENGINEER_JD);
      const result = scoreResume(resume, jd, 1.0);

      const tsResult = result.keywords.find((k) => k.term === 'TypeScript');
      expect(tsResult).toBeDefined();
      expect(tsResult?.stuffed).toBe(true);
      expect(tsResult?.mentions).toBeGreaterThan(4);
    });
  });

  describe('ComparisonTable Component', () => {
    it('renders comparison matrix with all competitor names and dimensions', () => {
      const html = renderToString(React.createElement(ComparisonTable));

      expect(html).toContain('data-testid="comparison-table"');
      expect(html).toContain('Rezi');
      expect(html).toContain('Jobscan');
      expect(html).toContain('Resume Worded');
      expect(html).toContain('Reactive Resume');
      expect(html).toContain('Our Builder (MVP)');

      // Key dimensions from Blueprint Section 2
      expect(html).toContain('Pricing Model');
      expect(html).toContain('Score Transparency');
      expect(html).toContain('AI Bullet Quality');
      expect(html).toContain('Preview &amp; PDF Fidelity');
      expect(html).toContain('Keyword Stuffing Handling');
      expect(html).toContain('ATS Parsing Safety');

      // Answers to competitor cons
      expect(html).toContain('$19 one-time 30-day pass');
      expect(html).toContain('Deterministic 80/10/10 math');
      expect(html).toContain('Strictly 0 invented facts');
      expect(html).toContain('100% match');
    });
  });

  describe('PricingSection Component', () => {
    it('renders Free ($0) and 30-Day Pass ($19) cards with transparent terms', () => {
      const html = renderToString(React.createElement(PricingSection));

      expect(html).toContain('data-testid="pricing-card-free"');
      expect(html).toContain('data-testid="pricing-card-pass"');
      expect(html).toContain('$0');
      expect(html).toContain('$19');
      expect(html).toContain('30-Day Job Hunt Pass');
      expect(html).toContain('No Auto-Renew');

      // Verify no recurring subscription claims
      expect(html).not.toContain('$19/mo');
      expect(html).not.toContain('$19/month');
      expect(html).toContain('Zero subscription traps: never auto-renews');
    });

    it('renders CTAs linking to registration', () => {
      const html = renderToString(React.createElement(PricingSection));

      expect(html).toContain('data-testid="pricing-cta-free"');
      expect(html).toContain('data-testid="pricing-cta-pass"');
      expect(html).toContain('Start Free');
      expect(html).toContain('Get 30-Day Pass ($19)');
      expect(html).toContain('href="/register"');
    });

    it('renders economic philosophy callout explaining the 30-day pass model', () => {
      const html = renderToString(React.createElement(PricingSection));

      expect(html).toContain('Why $19 for 30 days instead of a monthly subscription?');
      expect(html).toContain('Most active job searches take between 3 and 6 weeks');
    });
  });

  describe('Footer Component', () => {
    it('renders mission statement, navigation links, and privacy policy declaration', () => {
      const html = renderToString(React.createElement(Footer));

      expect(html).toContain('The resume builder that shows its work.');
      expect(html).toContain('data-testid="footer-privacy-statement"');
      expect(html).toContain('We never sell your data or log resume content');
      expect(html).toContain('PostgreSQL Row-Level Security (RLS)');
      expect(html).toContain('href="/register"');
      expect(html).toContain('href="/login"');
      expect(html).toContain('href="/dashboard"');
    });
  });

  describe('Home Page Modular Composition', () => {
    it('renders complete landing page structure with all components composed', () => {
      const html = renderToString(React.createElement(Home));

      expect(html).toContain('ATS Resume Builder');
      expect(html).toContain('The resume builder that');
      expect(html).toContain('shows its work.');
      expect(html).toContain('Core Architectural Pillars');
      expect(html).toContain('Free Live ATS Keyword Checker');
      expect(html).toContain('How We Compare');
      expect(html).toContain('Simple, Honest Pricing');
      expect(html).toContain('Privacy &amp; Integrity Statement');
    });
  });
});
