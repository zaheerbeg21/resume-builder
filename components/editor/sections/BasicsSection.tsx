'use client';

import React from 'react';
import { useResumeStore } from '@/lib/stores/resume-store';

export function BasicsSection() {
  const basics = useResumeStore((state) => state.resume.basics);
  const updateBasics = useResumeStore((state) => state.updateBasics);
  const addLink = useResumeStore((state) => state.addLink);
  const updateLink = useResumeStore((state) => state.updateLink);
  const removeLink = useResumeStore((state) => state.removeLink);

  const links = basics.links || [];
  const canAddLink = links.length < 5;

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 sm:p-6 shadow-xs">
      <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-5">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Contact & Basics
        </h2>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
          Provide your essential contact information and professional links.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Full Name */}
        <div className="sm:col-span-2">
          <label
            htmlFor="basics-fullname"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Full Name <span className="text-rose-500">*</span>
          </label>
          <input
            id="basics-fullname"
            data-testid="basics-fullname-input"
            type="text"
            required
            value={basics.fullName}
            onChange={(e) => updateBasics({ fullName: e.target.value })}
            placeholder="e.g. Jane Doe"
            className="w-full text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 transition"
          />
        </div>

        {/* Headline / Title */}
        <div className="sm:col-span-2">
          <label
            htmlFor="basics-headline"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Professional Headline
          </label>
          <input
            id="basics-headline"
            data-testid="basics-headline-input"
            type="text"
            value={basics.headline}
            onChange={(e) => updateBasics({ headline: e.target.value })}
            placeholder="e.g. Senior Full Stack Engineer"
            className="w-full text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 transition"
          />
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="basics-email"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Email Address <span className="text-rose-500">*</span>
          </label>
          <input
            id="basics-email"
            data-testid="basics-email-input"
            type="email"
            required
            value={basics.email}
            onChange={(e) => updateBasics({ email: e.target.value })}
            placeholder="jane.doe@example.com"
            className="w-full text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 transition"
          />
        </div>

        {/* Phone */}
        <div>
          <label
            htmlFor="basics-phone"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Phone Number
          </label>
          <input
            id="basics-phone"
            data-testid="basics-phone-input"
            type="tel"
            value={basics.phone ?? ''}
            onChange={(e) => updateBasics({ phone: e.target.value })}
            placeholder="+1 (555) 019-2834"
            className="w-full text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 transition"
          />
        </div>

        {/* Location */}
        <div className="sm:col-span-2">
          <label
            htmlFor="basics-location"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Location
          </label>
          <input
            id="basics-location"
            data-testid="basics-location-input"
            type="text"
            value={basics.location ?? ''}
            onChange={(e) => updateBasics({ location: e.target.value })}
            placeholder="e.g. San Francisco, CA"
            className="w-full text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 transition"
          />
        </div>
      </div>

      {/* External Links */}
      <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Web & Social Links
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Up to 5 external links (e.g. LinkedIn, GitHub, Portfolio).
            </p>
          </div>
          <button
            type="button"
            data-testid="add-link-btn"
            disabled={!canAddLink}
            onClick={() => addLink({ label: '', url: '' })}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition ${
              canAddLink
                ? 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                : 'opacity-50 cursor-not-allowed border-zinc-200 dark:border-zinc-800 text-zinc-400'
            }`}
          >
            + Add Link {links.length > 0 && `(${links.length}/5)`}
          </button>
        </div>

        {links.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic py-2">
            No links added yet. Click &quot;Add Link&quot; to include LinkedIn, GitHub, or your personal site.
          </p>
        ) : (
          <div className="space-y-3">
            {links.map((link, idx) => (
              <div
                key={`link-${idx}`}
                data-testid={`link-row-${idx}`}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Label (e.g. LinkedIn)"
                  value={link.label}
                  onChange={(e) => updateLink(idx, { label: e.target.value })}
                  className="w-1/3 text-xs bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <input
                  type="url"
                  placeholder="https://..."
                  value={link.url}
                  onChange={(e) => updateLink(idx, { url: e.target.value })}
                  className="flex-1 text-xs bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <button
                  type="button"
                  data-testid={`remove-link-${idx}`}
                  onClick={() => removeLink(idx)}
                  className="text-zinc-400 hover:text-rose-500 p-2 rounded-lg transition"
                  title="Remove link"
                  aria-label={`Remove link ${idx + 1}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
