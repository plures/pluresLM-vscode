/**
 * InMemoryService — a pure in-memory implementation of IMemoryProvider used in
 * tests so that no SQLite database or embedding model is required.
 *
 * Similarity search uses an optional custom scorer; the default returns a fixed
 * score of 1.0 so tests can focus on data flow rather than vector maths.
 *
 * Embedding behaviour:
 *   - `store()` produces entries with a sentinel `[1]` embedding so they are
 *     visible to `search()`.
 *   - `seed()` defaults to an empty `[]` embedding, simulating "legacy" entries
 *     that were imported without embeddings.  These entries appear in list/stats
 *     but are skipped by `search()`.
 *   - Pass an explicit non-empty `embedding` to `seed()` to make a seeded entry
 *     also searchable.
 *
 * Fault injection:
 *   - `storeError` is thrown by all mutating operations (`store`, `forgetByQuery`,
 *     `forgetById`, `deleteSource`) to simulate a fully unavailable backend.
 *   - `searchError` is thrown only by `search()`.
 *   - `empty` causes `search()` to always return `[]` without throwing.
 */

import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemorySearchResult } from '../../memory-db';
import type { IMemoryProvider, MemoryCategory, StatsResult } from '../../service.types';

export type ScoreFn = (queryContent: string, candidateContent: string) => number;

export interface ServiceFault {
  /**
   * If set, every mutating call (`store`, `forgetByQuery`, `forgetById`,
   * `deleteSource`) throws this error string.
   */
  storeError?: string;
  /** If set, every `search()` call throws this error. */
  searchError?: string;
  /** If true, `search()` always returns `[]` without throwing. */
  empty?: boolean;
}

// Sentinel embedding used by `store()` to mark entries as "has embedding".
// Must be non-empty so `search()` can distinguish them from legacy seeds.
const SENTINEL_EMBEDDING: number[] = [1];

export class InMemoryService implements IMemoryProvider {
  private memories: Map<string, MemoryEntry> = new Map();
  private scoreFn: ScoreFn;
  fault: ServiceFault;

  constructor(opts?: { scoreFn?: ScoreFn; fault?: ServiceFault }) {
    this.scoreFn = opts?.scoreFn ?? (() => 1.0);
    this.fault = opts?.fault ?? {};
  }

  // ── IMemoryProvider — lifecycle ────────────────────────────────────────────

  async ensureInitialized(): Promise<void> {
    // No-op for the in-memory mock; always ready.
  }

  close(): void {
    // No-op for the in-memory mock; no resources to release.
  }

  // ── IMemoryProvider — async operations ────────────────────────────────────

  async store(
    content: string,
    category: MemoryCategory = 'other',
    source = 'test',
    tags: string[] = []
  ): Promise<MemoryEntry> {
    if (this.fault.storeError) throw new Error(this.fault.storeError);
    const entry: MemoryEntry = {
      id: randomUUID(),
      content,
      // Non-empty sentinel so search() treats this as an embedded entry
      embedding: SENTINEL_EMBEDDING,
      created_at: Date.now(),
      source,
      tags,
      category
    };
    this.memories.set(entry.id, entry);
    return entry;
  }

  async search(query: string, limit = 5): Promise<MemorySearchResult[]> {
    if (this.fault.searchError) throw new Error(this.fault.searchError);
    if (this.fault.empty) return [];
    const results: MemorySearchResult[] = [];
    for (const entry of this.memories.values()) {
      // Skip legacy entries that have no embedding (seeded via seed() without an embedding)
      if (entry.embedding.length === 0) continue;
      const score = this.scoreFn(query, entry.content);
      if (score > 0) results.push({ entry, score });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async forgetByQuery(query: string, _threshold = 0.8): Promise<number> {
    if (this.fault.storeError) throw new Error(this.fault.storeError);
    const matches = await this.search(query, 50);
    for (const { entry } of matches) this.memories.delete(entry.id);
    return matches.length;
  }

  forgetById(id: string): boolean {
    if (this.fault.storeError) throw new Error(this.fault.storeError);
    return this.memories.delete(id);
  }

  deleteSource(source: string): number {
    if (this.fault.storeError) throw new Error(this.fault.storeError);
    let count = 0;
    for (const [id, entry] of this.memories) {
      if (entry.source === source) {
        this.memories.delete(id);
        count++;
      }
    }
    return count;
  }

  async indexWorkspace(_opts?: { maxFiles?: number; maxCharsPerFile?: number }): Promise<{ indexed: number; skipped: number }> {
    return { indexed: 0, skipped: 0 };
  }

  // ── IMemoryProvider — stats / counts ──────────────────────────────────────

  stats(): StatsResult {
    const categories: Record<string, number> = {};
    let lastCaptureTime: number | null = null;
    for (const entry of this.memories.values()) {
      categories[entry.category] = (categories[entry.category] ?? 0) + 1;
      if (lastCaptureTime === null || entry.created_at > lastCaptureTime) {
        lastCaptureTime = entry.created_at;
      }
    }
    return { totalMemories: this.memories.size, categories, edgeCount: 0, lastCaptureTime };
  }

  count(): number {
    return this.memories.size;
  }

  // ── IMemoryProvider — list operations ─────────────────────────────────────

  listSources(): Array<{ source: string; count: number }> {
    const map = new Map<string, number>();
    for (const entry of this.memories.values()) {
      map.set(entry.source, (map.get(entry.source) ?? 0) + 1);
    }
    return [...map.entries()].map(([source, count]) => ({ source, count }));
  }

  listByCategory(category: string, limit = 50): Array<Omit<MemoryEntry, 'embedding'>> {
    return [...this.memories.values()]
      .filter((e) => e.category === category)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .map(({ embedding: _e, ...rest }) => rest);
  }

  listBySource(source: string, limit = 50): Array<Omit<MemoryEntry, 'embedding'>> {
    return [...this.memories.values()]
      .filter((e) => e.source === source)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .map(({ embedding: _e, ...rest }) => rest);
  }

  listAllTags(): Array<{ tag: string; count: number }> {
    const map = new Map<string, number>();
    for (const entry of this.memories.values()) {
      for (const tag of entry.tags) {
        map.set(tag, (map.get(tag) ?? 0) + 1);
      }
    }
    return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }

  listByTag(tag: string, limit = 50): Array<Omit<MemoryEntry, 'embedding'>> {
    return [...this.memories.values()]
      .filter((e) => e.tags.includes(tag))
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .map(({ embedding: _e, ...rest }) => rest);
  }

  listByDateRange(start: number, end: number, limit = 50): Array<Omit<MemoryEntry, 'embedding'>> {
    return [...this.memories.values()]
      .filter((e) => e.created_at >= start && e.created_at <= end)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .map(({ embedding: _e, ...rest }) => rest);
  }

  // ── test helpers ───────────────────────────────────────────────────────────

  /**
   * Directly seed a memory entry without going through `store()`.
   *
   * Defaults to an empty `[]` embedding to simulate a legacy entry that was
   * imported without vector data.  Such entries appear in list/stats results
   * but are **not** returned by `search()` (which skips empty-embedding entries).
   * Pass an explicit `embedding` to make the seeded entry searchable.
   */
  seed(partial: Partial<MemoryEntry> & { content: string }): MemoryEntry {
    const entry: MemoryEntry = {
      id: partial.id ?? randomUUID(),
      content: partial.content,
      embedding: partial.embedding ?? [],   // empty by default → not searchable
      created_at: partial.created_at ?? Date.now(),
      source: partial.source ?? 'test-seed',
      tags: partial.tags ?? [],
      category: partial.category ?? 'other'
    };
    this.memories.set(entry.id, entry);
    return entry;
  }

  /** Clear all seeded/stored memories. */
  clear(): void {
    this.memories.clear();
  }
}
