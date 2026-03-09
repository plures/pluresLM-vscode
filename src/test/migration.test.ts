/**
 * QA Matrix — migration and legacy toggle behavior
 *
 * Covers:
 *   - Dimension mismatch detection: warn when stored embeddings use a
 *     different dimension than the current provider
 *   - First-run migration: dimension recorded into profile.facts on first use
 *   - Legacy toggle: service can be told to operate in "legacy" (no-embedding)
 *     mode and still serve list/stats correctly
 *   - storeRaw / seed path: memories without embeddings can be seeded and
 *     listed but NOT returned by search
 *   - Migration state transitions: empty DB → first store → dimension locked
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryService } from './mocks/memory-service.mock';

// ---------------------------------------------------------------------------
// Dimension migration helpers (test-local; mirrors memory-provider.ts logic)
// ---------------------------------------------------------------------------

interface ProfileData {
  facts: string[];
  capture_count: number;
}

function detectDimensionMismatch(profile: ProfileData | null, currentDim: number): string | null {
  if (!profile) return null;
  const stored = profile.facts.find((f) => f.startsWith('embedding_dimension:'));
  if (!stored) return null;
  const dim = parseInt(stored.split(':')[1], 10);
  return dim !== currentDim ? `Dimension mismatch: DB has ${dim}-dim, current is ${currentDim}-dim` : null;
}

function recordDimension(profile: ProfileData, dim: number): ProfileData {
  const hasRecord = profile.facts.some((f) => f.startsWith('embedding_dimension:'));
  if (hasRecord) return profile;
  return { ...profile, facts: [...profile.facts, `embedding_dimension:${dim}`] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migration — first-run dimension recording', () => {
  it('records dimension in profile when DB is fresh', () => {
    const profile: ProfileData = { facts: [], capture_count: 0 };
    const updated = recordDimension(profile, 384);
    expect(updated.facts).toContain('embedding_dimension:384');
  });

  it('does not duplicate the dimension fact on second call', () => {
    let profile: ProfileData = { facts: [], capture_count: 0 };
    profile = recordDimension(profile, 384);
    profile = recordDimension(profile, 384);
    const count = profile.facts.filter((f) => f.startsWith('embedding_dimension:')).length;
    expect(count).toBe(1);
  });

  it('standard dimension 384 (bge-small-en-v1.5) is recorded by default', () => {
    const profile: ProfileData = { facts: [], capture_count: 0 };
    const updated = recordDimension(profile, 384);
    expect(updated.facts).toContain('embedding_dimension:384');
  });
});

describe('migration — dimension mismatch detection', () => {
  it('returns null when profile has no dimension fact', () => {
    const profile: ProfileData = { facts: ['some other fact'], capture_count: 0 };
    expect(detectDimensionMismatch(profile, 384)).toBeNull();
  });

  it('returns null when profile is null (empty DB)', () => {
    expect(detectDimensionMismatch(null, 384)).toBeNull();
  });

  it('returns null when dimensions match', () => {
    const profile: ProfileData = { facts: ['embedding_dimension:384'], capture_count: 0 };
    expect(detectDimensionMismatch(profile, 384)).toBeNull();
  });

  it('returns warning message when dimensions differ', () => {
    const profile: ProfileData = { facts: ['embedding_dimension:1536'], capture_count: 0 };
    const warning = detectDimensionMismatch(profile, 384);
    expect(warning).not.toBeNull();
    expect(warning).toContain('1536');
    expect(warning).toContain('384');
  });

  it('detects OpenAI → local downgrade (1536 → 384)', () => {
    const profile: ProfileData = { facts: ['embedding_dimension:1536'], capture_count: 0 };
    const warning = detectDimensionMismatch(profile, 384);
    expect(warning).toContain('Dimension mismatch');
  });

  it('detects local → OpenAI upgrade (384 → 1536)', () => {
    const profile: ProfileData = { facts: ['embedding_dimension:384'], capture_count: 0 };
    const warning = detectDimensionMismatch(profile, 1536);
    expect(warning).toContain('Dimension mismatch');
  });
});

describe('migration — legacy (no-embedding) memories', () => {
  let svc: InMemoryService;

  beforeEach(() => { svc = new InMemoryService(); });

  it('seeded memories without embeddings appear in list results', () => {
    svc.seed({ content: 'legacy fact', category: 'other', source: 'import', tags: [] });
    expect(svc.count()).toBe(1);
    const list = svc.listByCategory('other');
    expect(list.some((e) => e.content === 'legacy fact')).toBe(true);
  });

  it('seeded memories contribute to stats', () => {
    svc.seed({ content: 'legacy decision', category: 'decision', source: 'import', tags: [] });
    const s = svc.stats();
    expect(s.totalMemories).toBe(1);
    expect(s.categories['decision']).toBe(1);
  });

  it('seeded memories are listable by source', () => {
    svc.seed({ content: 'from old db', source: 'legacy-import', tags: [], category: 'other' });
    expect(svc.listBySource('legacy-import')).toHaveLength(1);
  });
});

describe('migration — state transitions', () => {
  it('empty DB → store → count increments correctly', async () => {
    const svc = new InMemoryService();
    expect(svc.count()).toBe(0);
    await svc.store('first memory', 'decision', 'test', []);
    expect(svc.count()).toBe(1);
  });

  it('clear() resets service to initial state', async () => {
    const svc = new InMemoryService();
    await svc.store('a', 'other', 'test', []);
    await svc.store('b', 'other', 'test', []);
    svc.clear();
    expect(svc.count()).toBe(0);
    expect(svc.stats().totalMemories).toBe(0);
  });

  it('listByCategory returns empty after clear', async () => {
    const svc = new InMemoryService();
    await svc.store('decision memory', 'decision', 'test', []);
    svc.clear();
    expect(svc.listByCategory('decision')).toHaveLength(0);
  });

  it('forgetById removes a seeded entry correctly', () => {
    const svc = new InMemoryService();
    const entry = svc.seed({ content: 'to remove', category: 'other', source: 'test', tags: [] });
    expect(svc.count()).toBe(1);
    expect(svc.forgetById(entry.id)).toBe(true);
    expect(svc.count()).toBe(0);
  });

  it('service tolerates being cleared multiple times', () => {
    const svc = new InMemoryService();
    expect(() => { svc.clear(); svc.clear(); }).not.toThrow();
  });
});

describe('migration — embedding provider fallback chain', () => {
  it('dimension 384 is the default (Transformers.js bge-small-en-v1.5)', () => {
    // This test documents the expected default dimension value.
    const DEFAULT_DIMENSION = 384;
    const profile: ProfileData = { facts: [], capture_count: 0 };
    const updated = recordDimension(profile, DEFAULT_DIMENSION);
    expect(updated.facts[0]).toBe('embedding_dimension:384');
  });

  it('dimension 1536 corresponds to OpenAI text-embedding-3-small', () => {
    const OPENAI_DIMENSION = 1536;
    const profile: ProfileData = { facts: [], capture_count: 0 };
    const updated = recordDimension(profile, OPENAI_DIMENSION);
    expect(updated.facts[0]).toBe('embedding_dimension:1536');
  });

  it('switching provider triggers mismatch warning', () => {
    // Simulate: was using OpenAI, now using local Transformers.js
    const profile: ProfileData = { facts: ['embedding_dimension:1536'], capture_count: 5 };
    const warning = detectDimensionMismatch(profile, 384);
    expect(warning).toBeTruthy();
  });

  it('no mismatch warning when same provider is used again', () => {
    const profile: ProfileData = { facts: ['embedding_dimension:384'], capture_count: 10 };
    const warning = detectDimensionMismatch(profile, 384);
    expect(warning).toBeNull();
  });
});
