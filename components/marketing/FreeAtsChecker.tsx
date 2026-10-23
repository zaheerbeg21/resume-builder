'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { scoreResume, type MatchResult } from '@/lib/scoring/match';
import type { Resume } from '@/types/resume';
import type { JdAnalysis, JdKeyword } from '@/lib/ai/schemas';

// Common tech & industry keyword bank for fast, client-side JD extraction
const KNOWN_KEYWORDS: { term: string; aliases: string[]; category: JdKeyword['category'] }[] = [
  { term: 'TypeScript', aliases: ['ts'], category: 'hard_skill' },
  { term: 'JavaScript', aliases: ['js', 'es6'], category: 'hard_skill' },
  { term: 'React', aliases: ['react.js', 'reactjs'], category: 'tool' },
  { term: 'Next.js', aliases: ['nextjs', 'next'], category: 'tool' },
  { term: 'Node.js', aliases: ['nodejs', 'node'], category: 'tool' },
  { term: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss'], category: 'tool' },
  { term: 'PostgreSQL', aliases: ['postgres', 'sql'], category: 'tool' },
  { term: 'GraphQL', aliases: ['gql'], category: 'tool' },
  { term: 'REST API', aliases: ['rest', 'restful'], category: 'method' },
  { term: 'Docker', aliases: ['containerization', 'containers'], category: 'tool' },
  { term: 'Kubernetes', aliases: ['k8s'], category: 'tool' },
  { term: 'AWS', aliases: ['amazon web services', 'cloud'], category: 'tool' },
  { term: 'CI/CD', aliases: ['continuous integration', 'github actions', 'pipelines'], category: 'method' },
  { term: 'Git', aliases: ['github', 'version control'], category: 'tool' },
  { term: 'Unit Testing', aliases: ['vitest', 'jest', 'testing'], category: 'method' },
  { term: 'System Design', aliases: ['architecture', 'microservices'], category: 'domain' },
  { term: 'Agile', aliases: ['scrum', 'sprints'], category: 'method' },
  { term: 'Python', aliases: ['py'], category: 'hard_skill' },
  { term: 'Product Strategy', aliases: ['roadmap', 'vision'], category: 'domain' },
  { term: 'A/B Testing', aliases: ['experimentation'], category: 'method' },
  { term: 'User Research', aliases: ['interviews', 'usability'], category: 'domain' },
  { term: 'SQL', aliases: ['relational database'], category: 'hard_skill' },
];

export const SAMPLE_ENGINEER_RESUME = `Alex Rivera
Senior Full-Stack Engineer
alex.rivera@example.com | Seattle, WA | https://github.com/alexrivera

Summary
Senior Software Engineer with 7+ years developing scalable web applications and distributed cloud systems using TypeScript, React, Next.js, and Node.js.

Experience
Staff Engineer | Acme Cloud Systems | 2021 - Present
- Architected enterprise React and Next.js applications serving over 2M monthly active users.
- Designed resilient microservices with Node.js and TypeScript, reducing p99 latency by 35%.
- Implemented automated CI/CD deployment pipelines using Docker and AWS.
- Led sprint planning and agile retrospectives for a team of 6 engineers.

Software Engineer | BetaTech Corp | 2018 - 2021
- Developed high-throughput REST APIs and GraphQL interfaces using PostgreSQL and Redis.
- Authored comprehensive unit testing and integration suites achieving 92% test coverage with Jest.
- Maintained core Git repositories and standardized code review practices.

Education
University of Washington | B.S. in Computer Science | 2014 - 2018

Skills
Languages & Frameworks: TypeScript, JavaScript, React, Next.js, Node.js, Tailwind CSS, SQL
Tools & Infrastructure: Docker, AWS, Git, CI/CD, REST API, Unit Testing`;

export const SAMPLE_ENGINEER_JD = `Senior Software Engineer (Full-Stack)
Acme Cloud Systems is looking for a Senior Software Engineer to build our next-generation web platforms.

Requirements (Must Have):
- 5+ years of experience with TypeScript and modern JavaScript.
- Strong proficiency in React, Next.js, and modern CSS frameworks like Tailwind CSS.
- Proven experience architecting backend microservices and APIs with Node.js and REST API.
- Deep familiarity with Docker, AWS, and automated CI/CD pipelines.
- Commitment to high test coverage and Unit Testing.

Preferred Qualifications:
- Experience with GraphQL and PostgreSQL.
- Knowledge of Kubernetes and System Design principles.
- Familiarity with Agile development practices and Git workflow.`;

export const SAMPLE_PM_RESUME = `Jordan Taylor
Senior Product Manager
jordan.taylor@example.com | San Francisco, CA | https://linkedin.com/in/jordantaylor

Summary
Product Leader with 6+ years driving product strategy, user research, and cross-functional execution for B2B SaaS applications.

Experience
Senior Product Manager | GrowthSphere | 2022 - Present
- Defined product strategy and quarterly roadmaps for core analytics platform growing ARR by 42%.
- Conducted regular user research and customer interviews with 80+ enterprise stakeholders.
- Ran rapid A/B testing and experimentation cycles to improve onboarding funnel completion by 28%.
- Partnered with engineering teams to run 2-week Agile sprints and backlog prioritization.

Product Manager | InnovateX | 2019 - 2022
- Led feature development from discovery to launch, authoring clear PRDs and specs.
- Utilized SQL and data analysis dashboards to measure feature adoption and retention.

Education
UC Berkeley | B.A. in Economics | 2015 - 2019

Skills
Product: Product Strategy, User Research, A/B Testing, Agile, Roadmapping, PRDs
Technical & Analytical: SQL, Data Analysis, JIRA, Metrics`;

export const SAMPLE_PM_JD = `Senior Product Manager - Enterprise SaaS
We are looking for a Senior Product Manager to spearhead our core analytics product.

Requirements:
- Proven experience in Product Strategy and roadmap execution for SaaS products.
- Hands-on expertise in User Research and translating user feedback into product specs.
- Strong track record designing and evaluating A/B Testing experimentation.
- Experience with Agile methodologies and cross-functional team leadership.

Nice to have:
- Familiarity with SQL and data-driven product analytics.
- Technical understanding of APIs and modern web architectures.`;

/**
 * Parses raw resume text into a structured Resume object for scoreResume().
 */
export function parseClientResumeText(text: string): Resume {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const fullName = lines[0] || 'Candidate';
  const headline = lines[1] && !lines[1].includes('@') ? lines[1] : 'Professional';
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const email = emailMatch ? emailMatch[0].toLowerCase() : 'candidate@example.com';

  // Section splitting
  const sections: {
    summary: string[];
    experience: string[];
    projects: string[];
    education: string[];
    skills: string[];
  } = {
    summary: [],
    experience: [],
    projects: [],
    education: [],
    skills: [],
  };

  let currentSection: keyof typeof sections | null = null;

  for (const line of lines.slice(2)) {
    const clean = line.toLowerCase().replace(/[:\-#*]/g, '').trim();
    if (/^(?:summary|professional summary|about|profile)$/i.test(clean)) {
      currentSection = 'summary';
      continue;
    }
    if (/^(?:experience|work experience|employment history)$/i.test(clean)) {
      currentSection = 'experience';
      continue;
    }
    if (/^(?:projects|key projects|notable projects)$/i.test(clean)) {
      currentSection = 'projects';
      continue;
    }
    if (/^(?:education|academics)$/i.test(clean)) {
      currentSection = 'education';
      continue;
    }
    if (/^(?:skills|technical skills|core competencies|tools)$/i.test(clean)) {
      currentSection = 'skills';
      continue;
    }

    if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // Parse experience bullets
  const experienceBullets = sections.experience
    .filter((l) => /^[-•*]/.test(l) || l.length > 20)
    .map((l) => l.replace(/^[-•*]\s*/, ''));

  // Parse skills items
  const skillItems: string[] = [];
  for (const line of sections.skills) {
    const parts = line.split(/[:;,|]/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (!/^(?:languages|frameworks|tools|infrastructure|skills|technical)$/i.test(part)) {
        skillItems.push(part);
      }
    }
  }

  return {
    basics: {
      fullName,
      headline,
      email,
      links: [],
    },
    summary: sections.summary.join(' '),
    experience: [
      {
        id: 'exp-sandbox-1',
        company: 'Sample Company',
        title: headline,
        start: '2020-01',
        end: null,
        current: true,
        bullets: experienceBullets.length > 0 ? experienceBullets : [text.slice(0, 150)],
      },
    ],
    projects: [],
    education: [
      {
        id: 'edu-sandbox-1',
        school: 'University',
        degree: 'Bachelor Degree',
        start: '2015',
        end: '2019',
      },
    ],
    skills: [
      {
        group: 'All Skills',
        items: skillItems.length > 0 ? skillItems : ['General'],
      },
    ],
  };
}

/**
 * Extracts job title and keywords from raw job description text.
 */
export function parseClientJdText(text: string): JdAnalysis {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const jobTitle = lines[0] ? lines[0].replace(/^(?:job\s+title|title)[:\-]\s*/i, '') : 'Software Engineer';
  const lowerText = text.toLowerCase();

  // Find requirements block for importance classification
  const reqIndex = lowerText.search(/(?:requirements|must have|required qualifications|what you will need)/i);
  const prefIndex = lowerText.search(/(?:preferred|nice to have|bonus|optional)/i);

  const keywords: JdKeyword[] = [];
  const foundTerms = new Set<string>();

  for (const item of KNOWN_KEYWORDS) {
    const allPatterns = [item.term.toLowerCase(), ...item.aliases.map((a) => a.toLowerCase())];
    let matchedPos = -1;

    for (const p of allPatterns) {
      // Regex boundary search
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const idx = text.search(re);
      if (idx !== -1) {
        matchedPos = idx;
        break;
      }
    }

    if (matchedPos !== -1 && !foundTerms.has(item.term)) {
      foundTerms.add(item.term);

      let importance: 'required' | 'preferred' = 'required';
      if (prefIndex !== -1 && matchedPos > prefIndex && (reqIndex === -1 || prefIndex > reqIndex)) {
        importance = 'preferred';
      } else if (reqIndex !== -1 && matchedPos < reqIndex && prefIndex !== -1 && matchedPos > prefIndex) {
        importance = 'preferred';
      }

      keywords.push({
        term: item.term,
        aliases: item.aliases,
        category: item.category,
        importance,
      });
    }
  }

  // If no known keywords matched, extract from capitalized lines or requirements
  if (keywords.length === 0) {
    keywords.push(
      { term: 'Communication', aliases: [], category: 'domain', importance: 'required' },
      { term: 'Problem Solving', aliases: [], category: 'domain', importance: 'preferred' }
    );
  }

  return {
    job_title: jobTitle,
    years_experience: 5,
    education: "Bachelor's Degree",
    keywords,
  };
}

export function FreeAtsChecker() {
  const [resumeText, setResumeText] = useState(SAMPLE_ENGINEER_RESUME);
  const [jdText, setJdText] = useState(SAMPLE_ENGINEER_JD);

  // Score computation is pure and synchronous via lib/scoring/match
  const matchResult: MatchResult = useMemo(() => {
    try {
      const parsedResume = parseClientResumeText(resumeText);
      const parsedJd = parseClientJdText(jdText);
      // Format score: 1.0 format score for clean text structure
      return scoreResume(parsedResume, parsedJd, 1.0);
    } catch {
      return {
        score: 0,
        breakdown: { coverage: 0, title: 0, format: 0 },
        keywords: [],
        missingRequired: [],
      };
    }
  }, [resumeText, jdText]);

  const loadPreset = (type: 'engineer' | 'pm' | 'clear') => {
    if (type === 'engineer') {
      setResumeText(SAMPLE_ENGINEER_RESUME);
      setJdText(SAMPLE_ENGINEER_JD);
    } else if (type === 'pm') {
      setResumeText(SAMPLE_PM_RESUME);
      setJdText(SAMPLE_PM_JD);
    } else {
      setResumeText('');
      setJdText('');
    }
  };

  const getGrade = (score: number) => {
    if (score >= 85) return { grade: 'A', text: 'Strong Match', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500' };
    if (score >= 70) return { grade: 'B', text: 'Good Match', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500' };
    if (score >= 50) return { grade: 'C', text: 'Fair Match', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500' };
    return { grade: 'D', text: 'Needs Targeting', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500' };
  };

  const rating = getGrade(matchResult.score);

  return (
    <section id="ats-checker" className="py-16 sm:py-24 bg-zinc-50/60 dark:bg-zinc-900/30 border-y border-zinc-200/80 dark:border-zinc-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
            <span>⚡ Interactive Sandbox</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Free Live ATS Keyword Checker
          </h2>
          <p className="mt-3 text-base sm:text-lg text-zinc-600 dark:text-zinc-400">
            Paste your resume and target job description below. Our deterministic scoring engine calculates your ATS match score instantly in your browser—showing line-by-line keyword proof.
          </p>

          {/* Preset Buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1">Load sample:</span>
            <button
              type="button"
              onClick={() => loadPreset('engineer')}
              className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-800 dark:text-zinc-200 transition-colors shadow-2xs"
            >
              Software Engineer
            </button>
            <button
              type="button"
              onClick={() => loadPreset('pm')}
              className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-800 dark:text-zinc-200 transition-colors shadow-2xs"
            >
              Product Manager
            </button>
            <button
              type="button"
              onClick={() => loadPreset('clear')}
              className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
            >
              Clear Text
            </button>
          </div>
        </div>

        {/* Live Score Output Card */}
        <div
          data-testid="ats-checker-score-card"
          className="mt-10 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 shadow-sm transition-all"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Total Score Badge */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center text-center p-6 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
              <span className="text-xs uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">
                Keyword Match Score
              </span>
              <div className="mt-3 flex items-baseline gap-1">
                <span
                  data-testid="live-match-score"
                  className="text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50"
                >
                  {matchResult.score}
                </span>
                <span className="text-xl font-semibold text-zinc-400 dark:text-zinc-500">/ 100</span>
              </div>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                <span className={`w-2 h-2 rounded-full ${rating.bg}`} />
                <span className={rating.color}>Grade {rating.grade}: {rating.text}</span>
              </div>
            </div>

            {/* Score Breakdown (80 / 10 / 10) */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                    Keyword Coverage
                  </span>
                  <span
                    data-testid="breakdown-coverage"
                    className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300"
                  >
                    {matchResult.breakdown.coverage} / 80 pts
                  </span>
                </div>
                <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (matchResult.breakdown.coverage / 80) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 block">
                  Weighted by required vs. preferred keywords and section context.
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                    Job Title Alignment
                  </span>
                  <span
                    data-testid="breakdown-title"
                    className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300"
                  >
                    {matchResult.breakdown.title} / 10 pts
                  </span>
                </div>
                <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (matchResult.breakdown.title / 10) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 block">
                  Headline and latest job title overlap with target role.
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                    ATS Format & Readability
                  </span>
                  <span
                    data-testid="breakdown-format"
                    className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300"
                  >
                    {matchResult.breakdown.format} / 10 pts
                  </span>
                </div>
                <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-purple-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (matchResult.breakdown.format / 10) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 block">
                  Real-text single-column layout, standard headers, and zero parsing blockers.
                </span>
              </div>
            </div>
          </div>

          {/* Keyword Badges & Evidence */}
          <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Matched Keywords */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <span>✓</span> Matched Keywords ({matchResult.keywords.filter((k) => k.found).length})
                </span>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[3rem]">
                {matchResult.keywords.filter((k) => k.found).length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No keywords matched yet.</p>
                ) : (
                  matchResult.keywords
                    .filter((k) => k.found)
                    .map((kw) => (
                      <span
                        key={kw.term}
                        data-testid="matched-keyword-badge"
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${
                          kw.stuffed
                            ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                        }`}
                      >
                        <span>{kw.term}</span>
                        <span className="text-[10px] opacity-75 font-mono">({kw.mentions}x)</span>
                        {kw.stuffed && (
                          <span
                            title="Mentioned > 4 times; capped to prevent keyword stuffing penalties"
                            className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-bold"
                          >
                            [Capped]
                          </span>
                        )}
                      </span>
                    ))
                )}
              </div>
            </div>

            {/* Missing Required Keywords */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <span>!</span> Missing Required ({matchResult.missingRequired.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[3rem]">
                {matchResult.missingRequired.length === 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    All required keywords are present!
                  </p>
                ) : (
                  matchResult.missingRequired.map((term) => (
                    <span
                      key={term}
                      data-testid="missing-keyword-badge"
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
                    >
                      + {term}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Action Conversion Bar */}
          <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
            <div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Want to fix these missing keywords in 1 click?
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Our Guided Editor adds verified keywords to your skills section and improves bullets with zero hallucinations.
              </p>
            </div>
            <Link
              href="/register"
              data-testid="checker-cta-button"
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 rounded-lg transition-colors shadow-xs text-center whitespace-nowrap"
            >
              Build Free Resume &rarr;
            </Link>
          </div>
        </div>

        {/* Side-by-Side Editable Textareas */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Resume Textarea */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="sandbox-resume"
                className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2"
              >
                <span>📄 Resume Text</span>
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  (Paste or edit)
                </span>
              </label>
              <span className="text-xs text-zinc-400 font-mono">
                {resumeText.length} characters
              </span>
            </div>
            <textarea
              id="sandbox-resume"
              data-testid="sandbox-resume-textarea"
              rows={14}
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your raw resume text here..."
              className="w-full p-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all resize-y shadow-xs"
            />
          </div>

          {/* Job Description Textarea */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="sandbox-jd"
                className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2"
              >
                <span>🎯 Target Job Description</span>
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  (Paste or edit)
                </span>
              </label>
              <span className="text-xs text-zinc-400 font-mono">
                {jdText.length} characters
              </span>
            </div>
            <textarea
              id="sandbox-jd"
              data-testid="sandbox-jd-textarea"
              rows={14}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the target job description here..."
              className="w-full p-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500 focus:outline-hidden transition-all resize-y shadow-xs"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
