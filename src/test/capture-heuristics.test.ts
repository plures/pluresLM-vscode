/**
 * QA Matrix — auto-capture & recall heuristics
 *
 * Covers:
 *   - shouldSkipFile: generated/binary/lock files are rejected
 *   - isContentTrivial: short content is rejected
 *   - CaptureCooldown: per-file cooldown prevents redundant captures
 *   - filterByRelevance: low-score results are pruned, max results honoured
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldSkipFile,
  isContentTrivial,
  CaptureCooldown,
  filterByRelevance,
  DEFAULT_MIN_CONTENT_LENGTH,
  DEFAULT_CAPTURE_COOLDOWN_MS,
  DEFAULT_MIN_RECALL_SCORE,
} from '../capture-heuristics';

// ---------------------------------------------------------------------------
// shouldSkipFile
// ---------------------------------------------------------------------------

describe('shouldSkipFile', () => {
  it('skips node_modules paths', () => {
    expect(shouldSkipFile('node_modules/lodash/index.js')).toBe(true);
    expect(shouldSkipFile('src/node_modules/foo.ts')).toBe(true);
  });

  it('skips lock files', () => {
    expect(shouldSkipFile('package-lock.json')).toBe(true);
    expect(shouldSkipFile('yarn.lock')).toBe(true);
    expect(shouldSkipFile('pnpm-lock.yaml')).toBe(true);
  });

  it('skips .d.ts declaration files', () => {
    expect(shouldSkipFile('src/types/index.d.ts')).toBe(true);
  });

  it('skips .min.js and .map files', () => {
    expect(shouldSkipFile('dist/bundle.min.js')).toBe(true);
    expect(shouldSkipFile('dist/bundle.js.map')).toBe(true);
  });

  it('skips image/binary extensions', () => {
    expect(shouldSkipFile('logo.png')).toBe(true);
    expect(shouldSkipFile('photo.jpg')).toBe(true);
    expect(shouldSkipFile('app.exe')).toBe(true);
  });

  it('skips .snap test snapshots', () => {
    expect(shouldSkipFile('__snapshots__/foo.test.ts.snap')).toBe(true);
  });

  it('allows normal source files', () => {
    expect(shouldSkipFile('src/index.ts')).toBe(false);
    expect(shouldSkipFile('lib/utils.py')).toBe(false);
    expect(shouldSkipFile('README.md')).toBe(false);
  });

  it('skips dist/ and build/ paths', () => {
    expect(shouldSkipFile('dist/extension.js')).toBe(true);
    expect(shouldSkipFile('build/output.js')).toBe(true);
  });

  it('skips .generated.* files', () => {
    expect(shouldSkipFile('src/schema.generated.ts')).toBe(true);
  });

  it('skips coverage directories', () => {
    expect(shouldSkipFile('coverage/lcov.info')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isContentTrivial
// ---------------------------------------------------------------------------

describe('isContentTrivial', () => {
  it('returns true for empty content', () => {
    expect(isContentTrivial('')).toBe(true);
  });

  it('returns true for whitespace-only content', () => {
    expect(isContentTrivial('   \n\t  ')).toBe(true);
  });

  it('returns true for content below default threshold', () => {
    expect(isContentTrivial('short')).toBe(true);
  });

  it('returns false for content at or above threshold', () => {
    const content = 'x'.repeat(DEFAULT_MIN_CONTENT_LENGTH);
    expect(isContentTrivial(content)).toBe(false);
  });

  it('respects custom minLength parameter', () => {
    expect(isContentTrivial('hello', 3)).toBe(false);
    expect(isContentTrivial('hi', 10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CaptureCooldown
// ---------------------------------------------------------------------------

describe('CaptureCooldown', () => {
  let cooldown: CaptureCooldown;

  beforeEach(() => {
    cooldown = new CaptureCooldown(DEFAULT_CAPTURE_COOLDOWN_MS);
  });

  it('allows first capture for a new file', () => {
    expect(cooldown.tryAcquire('src/index.ts', 1000)).toBe(true);
  });

  it('blocks capture within cooldown period', () => {
    const now = 1000;
    cooldown.tryAcquire('src/index.ts', now);
    expect(cooldown.tryAcquire('src/index.ts', now + 5_000)).toBe(false);
  });

  it('allows capture after cooldown expires', () => {
    const now = 1000;
    cooldown.tryAcquire('src/index.ts', now);
    expect(cooldown.tryAcquire('src/index.ts', now + DEFAULT_CAPTURE_COOLDOWN_MS + 1)).toBe(true);
  });

  it('tracks files independently', () => {
    cooldown.tryAcquire('a.ts', 1000);
    expect(cooldown.tryAcquire('b.ts', 1001)).toBe(true);
    expect(cooldown.tryAcquire('a.ts', 1002)).toBe(false);
  });

  it('clear() resets all cooldowns', () => {
    cooldown.tryAcquire('a.ts', 1000);
    cooldown.clear();
    expect(cooldown.tryAcquire('a.ts', 1001)).toBe(true);
  });

  it('respects custom cooldown value', () => {
    const short = new CaptureCooldown(100);
    short.tryAcquire('a.ts', 1000);
    expect(short.tryAcquire('a.ts', 1050)).toBe(false);
    expect(short.tryAcquire('a.ts', 1101)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterByRelevance
// ---------------------------------------------------------------------------

describe('filterByRelevance', () => {
  const makeResults = (scores: number[]) =>
    scores.map((score, i) => ({ score, entry: { id: `${i}`, content: `item ${i}` } }));

  it('filters out results below the default threshold', () => {
    const results = makeResults([0.9, 0.4, 0.6, 0.2]);
    const filtered = filterByRelevance(results);
    expect(filtered.every((r) => r.score >= DEFAULT_MIN_RECALL_SCORE)).toBe(true);
    expect(filtered).toHaveLength(2); // 0.9 and 0.6
  });

  it('respects custom minScore', () => {
    const results = makeResults([0.9, 0.7, 0.3]);
    const filtered = filterByRelevance(results, 0.8);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].score).toBe(0.9);
  });

  it('limits to maxResults', () => {
    const results = makeResults([0.9, 0.8, 0.7, 0.6, 0.55, 0.51]);
    const filtered = filterByRelevance(results, 0.5, 3);
    expect(filtered).toHaveLength(3);
  });

  it('returns empty array when no results meet threshold', () => {
    const results = makeResults([0.1, 0.2]);
    expect(filterByRelevance(results)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterByRelevance([])).toHaveLength(0);
  });
});
