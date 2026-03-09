/**
 * QA Matrix — store / search / stats / list flows
 *
 * Covers:
 *   - Store with category, source, tags
 *   - Search returns ranked results
 *   - Stats reflect stored data
 *   - List by category, source, tag, date range
 *   - Forget by query and by ID
 *   - Delete by source
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryService } from './mocks/memory-service.mock';
import type { MemoryCategory } from '../service.types';

// Score function: exact substring match → 1.0, otherwise 0.0
const substrScore = (q: string, c: string) => c.toLowerCase().includes(q.toLowerCase()) ? 1.0 : 0.0;

describe('store flow', () => {
  let svc: InMemoryService;

  beforeEach(() => { svc = new InMemoryService({ scoreFn: substrScore }); });

  it('returns a MemoryEntry with generated UUID', async () => {
    const entry = await svc.store('remember this', 'decision', 'vscode:command', ['important']);
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.content).toBe('remember this');
    expect(entry.category).toBe('decision');
    expect(entry.source).toBe('vscode:command');
    expect(entry.tags).toContain('important');
  });

  it('increments count after each unique store', async () => {
    expect(svc.count()).toBe(0);
    await svc.store('a', 'other', 'test', []);
    await svc.store('b', 'other', 'test', []);
    expect(svc.count()).toBe(2);
  });

  it('all valid categories are accepted', async () => {
    const cats: MemoryCategory[] = ['decision', 'preference', 'code-pattern', 'error-fix', 'architecture', 'other'];
    for (const cat of cats) {
      const entry = await svc.store(`content for ${cat}`, cat, 'test', []);
      expect(entry.category).toBe(cat);
    }
    expect(svc.count()).toBe(cats.length);
  });

  it('created_at timestamp is set to roughly now', async () => {
    const before = Date.now();
    const entry = await svc.store('timed entry', 'other', 'test', []);
    const after = Date.now();
    expect(entry.created_at).toBeGreaterThanOrEqual(before);
    expect(entry.created_at).toBeLessThanOrEqual(after);
  });
});

describe('search flow', () => {
  let svc: InMemoryService;

  beforeEach(async () => {
    svc = new InMemoryService({ scoreFn: substrScore });
    await svc.store('TypeScript generics are useful', 'code-pattern', 'vscode:chat', ['typescript']);
    await svc.store('Python is dynamically typed', 'other', 'vscode:chat', ['python']);
    await svc.store('Use async/await in TypeScript', 'preference', 'vscode:command', ['typescript', 'async']);
  });

  it('returns results matching the query', async () => {
    const results = await svc.search('TypeScript');
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.entry.content.toLowerCase()).toContain('typescript');
    }
  });

  it('results are sorted by score descending', async () => {
    const results = await svc.search('TypeScript');
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('limit parameter caps result count', async () => {
    const results = await svc.search('TypeScript', 1);
    expect(results).toHaveLength(1);
  });

  it('returns empty array when nothing matches', async () => {
    const results = await svc.search('Rust ownership');
    expect(results).toHaveLength(0);
  });

  it('each result has score between 0 and 1', async () => {
    const results = await svc.search('TypeScript');
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('stats flow', () => {
  let svc: InMemoryService;

  beforeEach(async () => {
    svc = new InMemoryService();
    await svc.store('decision A', 'decision', 'src-a', []);
    await svc.store('decision B', 'decision', 'src-b', []);
    await svc.store('a preference', 'preference', 'src-a', []);
  });

  it('totalMemories reflects stored count', () => {
    expect(svc.stats().totalMemories).toBe(3);
  });

  it('categories map has correct counts', () => {
    const { categories } = svc.stats();
    expect(categories['decision']).toBe(2);
    expect(categories['preference']).toBe(1);
  });

  it('lastCaptureTime is set after stores', () => {
    expect(svc.stats().lastCaptureTime).not.toBeNull();
  });

  it('stats() after clear() shows zero', () => {
    svc.clear();
    expect(svc.stats().totalMemories).toBe(0);
    expect(svc.stats().lastCaptureTime).toBeNull();
  });
});

describe('list flows', () => {
  let svc: InMemoryService;

  beforeEach(async () => {
    svc = new InMemoryService();
    await svc.store('arch note 1', 'architecture', 'project-index', ['infra']);
    await svc.store('arch note 2', 'architecture', 'project-index', ['infra', 'db']);
    await svc.store('pref note', 'preference', 'vscode:chat', ['ux']);
    await svc.store('error note', 'error-fix', 'vscode:command', []);
  });

  it('listByCategory returns matching entries', () => {
    const arch = svc.listByCategory('architecture');
    expect(arch).toHaveLength(2);
    for (const e of arch) expect(e.category).toBe('architecture');
  });

  it('listByCategory respects limit', () => {
    const arch = svc.listByCategory('architecture', 1);
    expect(arch).toHaveLength(1);
  });

  it('listBySource returns entries from that source only', () => {
    const from = svc.listBySource('project-index');
    expect(from).toHaveLength(2);
    for (const e of from) expect(e.source).toBe('project-index');
  });

  it('listByTag returns entries with that tag', () => {
    const tagged = svc.listByTag('infra');
    expect(tagged).toHaveLength(2);
    for (const e of tagged) expect(e.tags).toContain('infra');
  });

  it('listAllTags returns all distinct tags with counts', () => {
    const tags = svc.listAllTags();
    const infraTag = tags.find((t) => t.tag === 'infra');
    expect(infraTag?.count).toBe(2);
    const dbTag = tags.find((t) => t.tag === 'db');
    expect(dbTag?.count).toBe(1);
  });

  it('listByDateRange returns entries within the range', () => {
    const now = Date.now();
    const past = now - 60_000;
    const future = now + 60_000;
    const inRange = svc.listByDateRange(past, future);
    expect(inRange.length).toBeGreaterThanOrEqual(4);
  });

  it('listByDateRange excludes entries outside the range', () => {
    // Use a range in the far past — nothing should match
    const outOfRange = svc.listByDateRange(0, 1000);
    expect(outOfRange).toHaveLength(0);
  });

  it('listSources returns distinct sources with counts', () => {
    const sources = svc.listSources();
    const pi = sources.find((s) => s.source === 'project-index');
    expect(pi?.count).toBe(2);
  });

  it('returned entries do not contain embedding field', () => {
    const entries = svc.listByCategory('architecture');
    for (const e of entries) {
      expect(Object.keys(e)).not.toContain('embedding');
    }
  });
});

describe('forget flows', () => {
  let svc: InMemoryService;

  beforeEach(async () => {
    svc = new InMemoryService({ scoreFn: substrScore });
    await svc.store('delete me please', 'other', 'test', []);
    await svc.store('keep this around', 'other', 'test', []);
  });

  it('forgetByQuery removes matching entries', async () => {
    expect(svc.count()).toBe(2);
    const deleted = await svc.forgetByQuery('delete me');
    expect(deleted).toBe(1);
    expect(svc.count()).toBe(1);
  });

  it('forgetByQuery returns 0 when nothing matches', async () => {
    const deleted = await svc.forgetByQuery('Rust ownership');
    expect(deleted).toBe(0);
  });

  it('forgetById removes the specific entry', async () => {
    const entry = await svc.store('specific item', 'other', 'test', []);
    expect(svc.count()).toBe(3);
    const ok = svc.forgetById(entry.id);
    expect(ok).toBe(true);
    expect(svc.count()).toBe(2);
  });

  it('forgetById returns false for unknown ID', () => {
    const ok = svc.forgetById('00000000-0000-0000-0000-000000000000');
    expect(ok).toBe(false);
  });

  it('deleteSource removes all entries for that source', async () => {
    await svc.store('indexed file', 'architecture', 'vscode:index', ['project-index']);
    await svc.store('another indexed file', 'architecture', 'vscode:index', ['project-index']);
    expect(svc.count()).toBe(4);
    const deleted = svc.deleteSource('vscode:index');
    expect(deleted).toBe(2);
    expect(svc.count()).toBe(2);
    expect(svc.listBySource('vscode:index')).toHaveLength(0);
  });

  it('deleteSource returns 0 for unknown source', () => {
    expect(svc.deleteSource('nonexistent-source')).toBe(0);
  });
});
