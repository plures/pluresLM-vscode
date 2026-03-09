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
 *     listed but NOT returned by search (InMemoryService.search() skips
 *     entries with empty `embedding[]`)
 *   - Migration state transitions: empty DB → first store → dimension locked
 *
 * The `detectDimensionMismatch` and `recordDimension` helpers are imported
 * from `src/migration-utils.ts` — the same implementation used by
 * `MemoryProvider.checkDimensionMigration()` — so these tests exercise the
 * production logic rather than a hand-written duplicate.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryService } from './mocks/memory-service.mock';
import { detectDimensionMismatch, recordDimension, type ProfileData } from '../migration-utils';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Note: MemoryProvider.checkDimensionMigration() returns early when count===0
// (fresh DB), so it does not call recordDimension on the very first run.
// These tests exercise the recordDimension helper directly, documenting
// its contract independently of the MemoryProvider lifecycle.
describe('migration — recordDimension helper', () => {
  it('records the embedding dimension into profile.facts', () => {
    const profile: ProfileData = { facts: [], capture_count: 0 };
    const updated = recordDimension(profile, 384);
    expect(updated.facts).toContain('embedding_dimension:384');
  });

  it('does not duplicate the dimension fact on repeated calls', () => {
    let profile: ProfileData = { facts: [], capture_count: 0 };
    profile = recordDimension(profile, 384);
    profile = recordDimension(profile, 384);
    const count = profile.facts.filter((f) => f.startsWith('embedding_dimension:')).length;
    expect(count).toBe(1);
  });

  it('standard dimension 384 (bge-small-en-v1.5) is recorded correctly', () => {
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

  it('seeded memories without embeddings are NOT returned by search()', async () => {
    // This matches the real service behaviour: legacy entries exist in the store
    // but have no embedding vector, so they cannot be ranked by similarity.
    svc.seed({ content: 'legacy fact', category: 'other', source: 'import', tags: [] });
    const results = await svc.search('legacy fact');
    expect(results).toHaveLength(0);
  });

  it('seeded memories WITH embeddings are returned by search()', async () => {
    // Explicitly pass a non-empty embedding to make a seeded entry searchable
    const searchableSvc = new InMemoryService({ scoreFn: (q, c) => c.includes(q) ? 1.0 : 0.0 });
    searchableSvc.seed({ content: 'searchable seed', category: 'other', source: 'import', tags: [], embedding: [1] });
    const results = await searchableSvc.search('searchable seed');
    expect(results).toHaveLength(1);
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
