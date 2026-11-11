import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { removePageFurniture } from '@/lib/ai/helpers/page-furniture';

const FIXTURES_DIR = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'eval',
  'resumes',
);

describe('T-031 removePageFurniture helper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC 1: removes pdf-parse marker lines shaped "-- N of M --" with integers and keeps non-integer lookalikes', () => {
    const input = [
      'Morgan Fictional',
      'Summary',
      'Built telemetry ingestion pipelines.',
      '-- Note of Interest --',
      '',
      '-- 1 of 2 --',
      '',
      'Experience',
      'Kestrel Systems | Staff Engineer | 2020-01 - Present',
      '- Reduced tail latency by 30%.',
      '',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.text).not.toContain('-- 1 of 2 --');
    expect(result.text).not.toContain('-- 2 of 2 --');
    expect(result.text).toContain('-- Note of Interest --');
    expect(result.text).toContain('Morgan Fictional');
    expect(result.text).toContain('Kestrel Systems | Staff Engineer | 2020-01 - Present');
    expect(result.removedCount).toBe(0);
  });

  it('AC 2: removes fixture 07 repeated digit-different footer lines and keeps resume body and top header details', () => {
    const fixture07 = fs.readFileSync(
      path.join(FIXTURES_DIR, '07-repeated-footers.txt'),
      'utf8',
    );

    const result = removePageFurniture(fixture07);

    expect(result.removedCount).toBe(2);
    expect(result.text).not.toContain('-- 1 of 2 --');
    expect(result.text).not.toContain('-- 2 of 2 --');
    expect(result.text).not.toContain('Example Corp Candidate Dossier');
    expect(result.text).not.toContain('Page 1 of 2');
    expect(result.text).not.toContain('Page 2 of 2');
    expect(result.text).toContain('Avery Placeholder   avery.placeholder@example.org');
    expect(result.text).toContain('Avery Placeholder   avery.placeholder@example.org   +1-555-0173');
    expect(result.text).toContain('Designed automated node provisioning controller');
    expect(result.text).toContain('Platform: Kubernetes, Linux, Terraform');
  });

  it('AC 2 & 3: removes repeated top-edge headers across pages while keeping middle body lines and single-occurrence edge lines', () => {
    const input = [
      'Taylor Synthetic   Resume Page 1',
      'Confidential Draft',
      'Body Line A',
      'Body Line B',
      'Repeated Bullet Text',
      'Body Line C',
      'Body Line D',
      'Body Line E',
      'Unique Footer Page One',
      '',
      '-- 1 of 2 --',
      '',
      'Taylor Synthetic   Resume Page 2',
      'Confidential Draft',
      'Body Line F',
      'Body Line G',
      'Repeated Bullet Text',
      'Body Line H',
      'Body Line I',
      'Body Line J',
      'Unique Footer Page Two',
      '',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(3);
    expect(result.text).not.toContain('Taylor Synthetic   Resume Page 1');
    expect(result.text).not.toContain('Taylor Synthetic   Resume Page 2');
    expect(result.text.split('Confidential Draft').length - 1).toBe(1);
    expect(result.text).toContain('Repeated Bullet Text');
    expect(result.text).toContain('Unique Footer Page One');
    expect(result.text).toContain('Unique Footer Page Two');
  });

  it('AC 4: keeps identical normalized text when it appears at the top edge of one page and the bottom edge of another', () => {
    const input = [
      'Riley Imaginary | Portfolio Link',
      'Summary',
      'Built deterministic schedulers.',
      'Experience',
      'Northstar Labs | 2021 - Present',
      '- Shipped event bus.',
      'Page 1 Footer Unique',
      '',
      '-- 1 of 2 --',
      '',
      'Page 2 Header Unique',
      'Education',
      'Crestview College | B.S. CS | 2016 - 2020',
      'Skills',
      'Rust, TypeScript',
      'Core Systems',
      'Riley Imaginary | Portfolio Link',
      '',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(0);
    expect(result.text).toContain('Riley Imaginary | Portfolio Link');
    const occurrences = result.text.split('Riley Imaginary | Portfolio Link').length - 1;
    expect(occurrences).toBe(2);
  });

  it('AC 5: returns one-page documents unchanged with removedCount=0', () => {
    const onePageInput = [
      'Jordan Avery',
      'Staff Systems Architect',
      'Summary',
      'Built storage engines.',
      'Jordan Avery',
    ].join('\n');

    const result = removePageFurniture(onePageInput);

    expect(result.text).toBe(onePageInput);
    expect(result.removedCount).toBe(0);

    const onePageWithMarker = `${onePageInput}\n\n-- 1 of 1 --\n`;
    const markedResult = removePageFurniture(onePageWithMarker);

    expect(markedResult.text).toBe(onePageWithMarker);
    expect(markedResult.removedCount).toBe(0);
  });

  it('AC 7: preserves entity-swap invariance across fixture 07 and its swap twin, and removes repeated non-Latin edge lines', () => {
    const fixture07 = fs.readFileSync(
      path.join(FIXTURES_DIR, '07-repeated-footers.txt'),
      'utf8',
    );
    const fixture07Swap = fs.readFileSync(
      path.join(FIXTURES_DIR, '07-repeated-footers-swap.txt'),
      'utf8',
    );

    const baseRes = removePageFurniture(fixture07);
    const swapRes = removePageFurniture(fixture07Swap);

    expect(swapRes.removedCount).toBe(baseRes.removedCount);

    const swaps: Array<[string, string]> = [
      ['Avery Placeholder', 'Blake Mock'],
      ['avery.placeholder@example.org', 'blake.mock@example.org'],
      ['+1-555-0173', '+1-555-0273'],
      ['Example City', 'Sample Town'],
      ['https://example.org/avery', 'https://example.org/blake'],
      ['Example Corp', 'Sample Industries'],
      ['Fictional Labs', 'Synthetic Systems'],
      ['Example University', 'Sample College'],
    ];
    const reverseMapped = swaps.reduce(
      (acc, [from, to]) => acc.replaceAll(to, from),
      swapRes.text,
    );
    expect(reverseMapped).toBe(baseRes.text);

    const nonLatinInput = [
      'Ségolène Çelik',
      'Summary: 分散システム',
      'Experience line 1',
      'Experience line 2',
      '北星システムズ — 第1ページ',
      '-- 1 of 2 --',
      'Education line 1',
      'Education line 2',
      'Skills: 日本語, Rust',
      'Footer context',
      '北星システムズ — 第2ページ',
      '-- 2 of 2 --',
    ].join('\n');

    const nonLatinRes = removePageFurniture(nonLatinInput);
    expect(nonLatinRes.removedCount).toBe(2);
    expect(nonLatinRes.text).not.toContain('北星システムズ — 第1ページ');
    expect(nonLatinRes.text).not.toContain('北星システムズ — 第2ページ');
    expect(nonLatinRes.text).toContain('Ségolène Çelik');
    expect(nonLatinRes.text).toContain('分散システム');
  });

  it('AC 8: does not mutate the input string and logs nothing to console', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => { });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    const raw = [
      'Line 1',
      'Line 2',
      'SENTINEL_CONFIDENTIAL_LINE',
      'Footer Page 1',
      '-- 1 of 2 --',
      'Line 3',
      'Line 4',
      'Line 5',
      'Footer Page 2',
      '-- 2 of 2 --',
    ].join('\n');
    const copy = `${raw}`;

    removePageFurniture(copy);

    expect(copy).toBe(raw);
    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('Gap B: removes repeated same-edge occurrences across pages while preserving identical text in a middle body position', () => {
    const input = [
      'Jordan Avery',
      'Summary line',
      'Middle Content Alpha',
      'Middle Content Beta',
      'Middle Content Gamma',
      'Example Corp Candidate Dossier Page 1',
      '-- 1 of 2 --',
      'Experience Header',
      'Middle Content Delta',
      'Middle Content Epsilon',
      'Middle Content Zeta',
      'Example Corp Candidate Dossier Page 1',
      'Middle Content Eta',
      'Middle Content Theta',
      'Middle Content Iota',
      'Example Corp Candidate Dossier Page 2',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(2);
    expect(result.text).not.toContain('Example Corp Candidate Dossier Page 2');
    expect(
      result.text.split('Example Corp Candidate Dossier Page 1').length - 1,
    ).toBe(1);
  });

  it('Gap C: ignores interspersed empty and whitespace-only lines when selecting the first/last K non-empty edge lines', () => {
    const input = [
      '',
      '   ',
      'Top Header Alpha',
      '',
      'Top Header Beta',
      '',
      'Repeated Edge Candidate Page 1',
      'Body Alpha',
      'Body Beta',
      'Body Gamma',
      'Body Delta',
      'Bottom Only Alpha',
      '',
      '   ',
      '-- 1 of 2 --',
      '',
      '   ',
      'Top Header Gamma',
      '',
      'Top Header Delta',
      '',
      'Repeated Edge Candidate Page 2',
      'Body Epsilon',
      'Body Zeta',
      'Body Eta',
      'Body Theta',
      'Bottom Only Beta',
      '',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(2);
    expect(result.text).not.toContain('Repeated Edge Candidate Page 1');
    expect(result.text).not.toContain('Repeated Edge Candidate Page 2');
    expect(result.text).toContain('Body Alpha');
    expect(result.text).toContain('Bottom Only Alpha');
    expect(result.text).toContain('Bottom Only Beta');
  });

  it('Gap D: prevents a short page with <= 3 non-empty lines from counting itself twice across overlapping top/bottom windows', () => {
    const input = [
      'Short Page One A',
      'Short Page One B',
      '-- 1 of 2 --',
      'Short Page Two C',
      'Short Page Two D',
      'Short Page Two E',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(0);
    expect(result.text).toContain('Short Page One A');
    expect(result.text).toContain('Short Page One B');
    expect(result.text).toContain('Short Page Two C');
    expect(result.text).toContain('Short Page Two D');
    expect(result.text).toContain('Short Page Two E');
  });

  it('Phase 3 (Task 2): preserves distinct "Employment Period 2021" vs "Employment Period 2024" at the same edge across pages', () => {
    const input = [
      'Jordan Avery',
      'Employment Period 2021',
      'Experience body A',
      'Experience body B',
      'Footer Alpha',
      '-- 1 of 2 --',
      'Alex Morgan',
      'Employment Period 2024',
      'Education body C',
      'Education body D',
      'Footer Beta',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(0);
    expect(result.text).toContain('Employment Period 2021');
    expect(result.text).toContain('Employment Period 2024');
  });

  it('Phase 3 (Task 2): preserves distinct "Phone +1-555-0173" vs "Phone +1-555-0273" at the same edge across pages', () => {
    const input = [
      'Jordan Avery',
      'Phone +1-555-0173',
      'Experience body A',
      'Experience body B',
      'Footer Alpha',
      '-- 1 of 2 --',
      'Alex Morgan',
      'Phone +1-555-0273',
      'Education body C',
      'Education body D',
      'Footer Beta',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(0);
    expect(result.text).toContain('Phone +1-555-0173');
    expect(result.text).toContain('Phone +1-555-0273');
  });

  it('Phase 3 (Task 2): preserves distinct "Revenue 2024: 150000" vs "Revenue 2025: 250000" at the same edge across pages', () => {
    const input = [
      'Jordan Avery',
      'Revenue 2024: 150000',
      'Experience body A',
      'Experience body B',
      'Footer Alpha',
      '-- 1 of 2 --',
      'Alex Morgan',
      'Revenue 2025: 250000',
      'Education body C',
      'Education body D',
      'Footer Beta',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(0);
    expect(result.text).toContain('Revenue 2024: 150000');
    expect(result.text).toContain('Revenue 2025: 250000');
  });

  it('Phase 3 (Task 2): removes standalone "Page 1 of 2" / "Page 2 of 2" and genuine repeated page-numbered footers across same edge', () => {
    const input = [
      'Jordan Avery',
      'Summary line',
      'Middle line Alpha',
      'Middle line Beta',
      'Page 1 of 2',
      'Page 1 of 2   Fictional Systems Dossier',
      '-- 1 of 2 --',
      'Experience header',
      'Middle line Gamma',
      'Middle line Delta',
      'Page 2 of 2',
      'Page 2 of 2   Fictional Systems Dossier',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(4);
    expect(result.text).not.toContain('Page 1 of 2');
    expect(result.text).not.toContain('Page 2 of 2');
    expect(result.text).not.toContain('Fictional Systems Dossier');
    expect(result.text).toContain('Jordan Avery');
    expect(result.text).toContain('Experience header');
  });

  it('Phase 3 (Task 3 / AC 9): strips repeated inline "Page N of M" tokens from Fixture 07 top edges while keeping contact info and body', () => {
    const fixture07 = fs.readFileSync(
      path.join(FIXTURES_DIR, '07-repeated-footers.txt'),
      'utf8',
    );

    const result = removePageFurniture(fixture07);

    expect(result.text).not.toContain('Page 1 of 2');
    expect(result.text).not.toContain('Page 2 of 2');
    expect(result.text).not.toContain('Example Corp Candidate Dossier');
    expect(result.text).toContain('Avery Placeholder');
    expect(result.text).toContain('avery.placeholder@example.org');
    expect(result.text).toContain('+1-555-0173');
    expect(result.text).toContain('https://example.org/avery');
    expect(result.text).toContain('Designed automated node provisioning controller');
  });

  it('Phase 3 (Task 3 / AC 9): strips repeated inline "Page N of M" while preserving contact details both before and after the token', () => {
    const input = [
      'Morgan Synthetic   Page 1 of 2   +1-555-0188   morgan@example.org',
      'Summary',
      'Built replication services.',
      'Body Alpha',
      'Body Beta',
      'Unique Bottom Alpha',
      '-- 1 of 2 --',
      'Morgan Synthetic   Page 2 of 2   morgan@example.org',
      'Experience',
      'Northwind Corp | 2021 - Present',
      'Body Gamma',
      'Body Delta',
      'Unique Bottom Beta',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.text).not.toContain('Page 1 of 2');
    expect(result.text).not.toContain('Page 2 of 2');
    expect(result.text).toContain('Morgan Synthetic');
    expect(result.text).toContain('+1-555-0188');
    expect(result.text).toContain('morgan@example.org');
    expect(result.text).toContain('Built replication services.');
  });

  it('Phase 3 (Task 3 / AC 9): keeps inline "Page N of M" when seen on only one page, across opposite edges, or inside non-edge body lines', () => {
    const seenOnceInput = [
      'Jordan Avery   jordan@example.org   Page 1 of 2',
      'Body Alpha',
      'Body Beta',
      'Body Gamma',
      'Unique Bottom Alpha',
      '-- 1 of 2 --',
      'Jordan Avery   jordan@example.org',
      'Body Delta',
      'Body Epsilon',
      'Body Zeta',
      'Unique Bottom Beta',
      '-- 2 of 2 --',
    ].join('\n');
    expect(removePageFurniture(seenOnceInput).text).toContain('Page 1 of 2');

    const oppositeEdgesInput = [
      'Jordan Avery   Page 1 of 2',
      'Body Alpha',
      'Body Beta',
      'Body Gamma',
      'Unique Bottom Alpha',
      '-- 1 of 2 --',
      'Unique Top Beta',
      'Body Delta',
      'Body Epsilon',
      'Body Zeta',
      'Jordan Avery   Page 2 of 2',
      '-- 2 of 2 --',
    ].join('\n');
    const oppRes = removePageFurniture(oppositeEdgesInput);
    expect(oppRes.text).toContain('Page 1 of 2');
    expect(oppRes.text).toContain('Page 2 of 2');

    const bodyTokenInput = [
      'Jordan Avery   Page 1 of 2',
      'Header Alpha',
      'Header Beta',
      'Header Gamma',
      'Reviewed audit report Page 1 of 2 with security team',
      'Footer Alpha',
      'Footer Beta',
      'Footer Gamma',
      '-- 1 of 2 --',
      'Jordan Avery   Page 2 of 2',
      'Header Delta',
      'Header Epsilon',
      'Header Zeta',
      'Body Delta',
      'Footer Delta',
      'Footer Epsilon',
      'Footer Zeta',
      '-- 2 of 2 --',
    ].join('\n');
    const bodyRes = removePageFurniture(bodyTokenInput);
    expect(bodyRes.text).toContain(
      'Reviewed audit report Page 1 of 2 with security team',
    );
  });

  it('Phase 3 (Task 3 / AC 9): preserves entity-swap invariance across Fixture 07 and its swap twin after inline "Page N of M" stripping', () => {
    const fixture07 = fs.readFileSync(
      path.join(FIXTURES_DIR, '07-repeated-footers.txt'),
      'utf8',
    );
    const fixture07Swap = fs.readFileSync(
      path.join(FIXTURES_DIR, '07-repeated-footers-swap.txt'),
      'utf8',
    );

    const baseRes = removePageFurniture(fixture07);
    const swapRes = removePageFurniture(fixture07Swap);

    expect(baseRes.text).not.toContain('Page 1 of 2');
    expect(swapRes.text).not.toContain('Page 1 of 2');
    expect(swapRes.text).toContain('Blake Mock');
    expect(swapRes.text).toContain('blake.mock@example.org');
    expect(swapRes.text).toContain('+1-555-0273');

    const swaps: Array<[string, string]> = [
      ['Avery Placeholder', 'Blake Mock'],
      ['avery.placeholder@example.org', 'blake.mock@example.org'],
      ['+1-555-0173', '+1-555-0273'],
      ['Example City', 'Sample Town'],
      ['https://example.org/avery', 'https://example.org/blake'],
      ['Example Corp', 'Sample Industries'],
      ['Fictional Labs', 'Synthetic Systems'],
      ['Example University', 'Sample College'],
    ];
    const reverseMapped = swaps.reduce(
      (acc, [from, to]) => acc.replaceAll(to, from),
      swapRes.text,
    );
    expect(reverseMapped).toBe(baseRes.text);
  });

  it('Phase 4: normalizes explicit pg./p. page tokens while keeping ambiguous "1/2" and "- 1 -" without page context', () => {
    const input = [
      'Jordan Avery   pg. 1',
      '1/2',
      'Experience body A',
      'Experience body B',
      '- 1 -',
      'Footer Alpha   p. 1',
      '-- 1 of 2 --',
      'Jordan Avery   pg. 2',
      '2/2',
      'Education body C',
      'Education body D',
      '- 2 -',
      'Footer Alpha   p. 2',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(4);
    expect(result.text).not.toContain('pg. 1');
    expect(result.text).not.toContain('pg. 2');
    expect(result.text).not.toContain('Footer Alpha   p. 1');
    expect(result.text).not.toContain('Footer Alpha   p. 2');
    expect(result.text).toContain('1/2');
    expect(result.text).toContain('2/2');
    expect(result.text).toContain('- 1 -');
    expect(result.text).toContain('- 2 -');
  });

  it('review (1): keeps page 1 first line "Alex Example alex@example.org" when repeated verbatim on page 2 and removes the page 2 copy', () => {
    const input = [
      'Alex Example alex@example.org',
      'Staff Platform Engineer',
      'Summary',
      'Built fault-tolerant storage systems.',
      'Experience',
      'Example Corp | 2021-01 - Present',
      'Page 1 Footer Unique',
      '-- 1 of 2 --',
      'Alex Example alex@example.org',
      'Fictional Labs | 2018-04 - 2020-12',
      '- Shipped metrics pipeline.',
      'Education',
      'Example University | B.S. CS',
      'Skills: Go, TypeScript',
      'Page 2 Footer Unique',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);
    const lines = result.text.split(/\r?\n/);

    expect(lines[0]).toBe('Alex Example alex@example.org');
    expect(result.text.split('Alex Example alex@example.org').length - 1).toBe(1);
  });

  it('review (2): removes all copies of bottom-edge "Seite 1 von 2" / "Seite 2 von 2" and "Página 1 de 3"', () => {
    const germanInput = [
      'Morgan Synthetic',
      'Summary',
      'Built search pipelines.',
      'Experience',
      'Example Corp | 2020 - Present',
      '- Reduced query latency.',
      'Seite 1 von 2',
      '-- 1 of 2 --',
      'Education',
      'Example University | B.S. CS',
      'Skills',
      'Languages: TypeScript, Rust',
      'Projects',
      'KvStore',
      'Seite 2 von 2',
      '-- 2 of 2 --',
    ].join('\n');

    const deRes = removePageFurniture(germanInput);

    expect(deRes.removedCount).toBe(2);
    expect(deRes.text).not.toContain('Seite 1 von 2');
    expect(deRes.text).not.toContain('Seite 2 von 2');

    const spanishInput = [
      'Morgan Synthetic',
      'Summary',
      'Built search pipelines.',
      'Experience',
      'Example Corp | 2020 - Present',
      '- Reduced query latency.',
      'Página 1 de 3',
      '-- 1 of 3 --',
      'Fictional Labs | 2017 - 2020',
      '- Built ingestion queue.',
      'Projects',
      'KvStore',
      '- Added checkpointing.',
      'StreamIndex',
      'Página 2 de 3',
      '-- 2 of 3 --',
      'Education',
      'Example University | B.S. CS',
      'Skills',
      'Languages: TypeScript, Rust',
      'Certifications',
      'Systems Design',
      'Página 3 de 3',
      '-- 3 of 3 --',
    ].join('\n');

    const esRes = removePageFurniture(spanishInput);

    expect(esRes.removedCount).toBe(3);
    expect(esRes.text).not.toContain('Página 1 de 3');
    expect(esRes.text).not.toContain('Página 2 de 3');
    expect(esRes.text).not.toContain('Página 3 de 3');
  });

  it('review (3): a page with 5 non-empty lines does not use its body as bottom candidates', () => {
    const input = [
      'Taylor Fictional',
      'Summary',
      'Built replication engines.',
      'Experience',
      'Example Corp | 2021 - Present',
      '- Handled failover.',
      'Skills: Rust, Go',
      'Repeated Body Clause Alpha',
      '-- 1 of 2 --',
      'Page Two Header',
      'Fictional Systems | Engineer',
      'Repeated Body Clause Alpha',
      '- Verified distributed snapshots.',
      'Page Two Unique End',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(0);
    expect(result.text.split('Repeated Body Clause Alpha').length - 1).toBe(2);
    expect(result.text).toContain('Repeated Body Clause Alpha');
  });

  it('review (4): in a 3-page document where a header appears on pages 1 and 3 only, page 1 copy survives', () => {
    const input = [
      'Morgan Synthetic | morgan@example.org',
      'Summary',
      'Built distributed ledgers.',
      'Experience',
      'Example Corp | 2021 - Present',
      '- Led consensus upgrade.',
      'Page 1 Unique Footer',
      '-- 1 of 3 --',
      'Selected Projects',
      'KvStream',
      '- Compaction engine.',
      'SnapshotCheck',
      '- Offline verifier.',
      'OpenTools',
      'Page 2 Unique Footer',
      '-- 2 of 3 --',
      'Morgan Synthetic | morgan@example.org',
      'Education',
      'Example University | B.S. CS',
      'Skills',
      'Languages: TypeScript, Rust',
      'Platform: Linux, Go',
      'Page 3 Unique Footer',
      '-- 3 of 3 --',
    ].join('\n');

    const result = removePageFurniture(input);
    const lines = result.text.split(/\r?\n/);

    expect(lines[0]).toBe('Morgan Synthetic | morgan@example.org');
    expect(
      result.text.split('Morgan Synthetic | morgan@example.org').length - 1,
    ).toBe(1);
  });

  it('review (5): preserves "2021-03 - Present" and "2018-06 - 2021-02" in the body', () => {
    const input = [
      'Jordan Avery',
      'Staff Systems Architect',
      'Summary',
      '2021-03 - Present',
      'Experience',
      'Example Corp',
      'Page 1 Unique Bottom A',
      'Candidate Profile Page 1',
      '-- 1 of 2 --',
      'Prior Experience',
      'Northwind Labs',
      'Role History',
      '2021-03 - Present',
      '2018-06 - 2021-02',
      'Education',
      'Page 2 Unique Bottom B',
      'Candidate Profile Page 2',
      '-- 2 of 2 --',
    ].join('\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(2);
    expect(result.text.split('2021-03 - Present').length - 1).toBe(2);
    expect(result.text).toContain('2018-06 - 2021-02');
  });

  it('review (7): CRLF input keeps CRLF in the output', () => {
    const input = [
      'Jordan Avery',
      'Summary',
      'Built replication services.',
      'Example Footer Page 1',
      '-- 1 of 2 --',
      'Experience',
      'Example Corp | 2021 - Present',
      'Education: B.S. CS',
      'Example Footer Page 2',
      '-- 2 of 2 --',
    ].join('\r\n');

    const result = removePageFurniture(input);

    expect(result.removedCount).toBe(2);
    expect(result.text).toContain('\r\n');
    expect(result.text.replaceAll('\r\n', '')).not.toContain('\n');
  });
});

