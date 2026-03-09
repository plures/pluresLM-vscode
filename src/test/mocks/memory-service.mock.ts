/**
 * InMemoryService — a pure in-memory implementation of IMemoryProvider used in
 * tests so that no SQLite database or embedding model is required.
 *
 * Similarity search uses an optional custom scorer; the default returns a fixed
 * score of 1.0 so tests can focus on data flow rather than vector maths.
 */

import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemorySearchResult } from '../../memory-db';
import type { IMemoryProvider, MemoryCategory, StatsResult } from '../../service.types';

export type ScoreFn = (queryContent: string, candidateContent: string) => number;

export interface ServiceFault {
  /** If set, every mutating call throws this error. */
  storeError?: string;
  /** If set, every search call throws this error. */
  searchError?: string;
  /** If true, the service appears initialised but returns empty results everywhere. */
  empty?: boolean;
}

export class InMemoryService implements IMemoryProvider {
  private memories: Map<string, MemoryEntry> = new Map();
  private scoreFn: ScoreFn;
  fault: ServiceFault;

  constructor(opts?: { scoreFn?: ScoreFn; fault?: ServiceFault }) {
    this.scoreFn = opts?.scoreFn ?? (() => 1.0);
    this.fault = opts?.fault ?? {};
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private makeEntry(
    content: string,
    category: MemoryCategory,
    source: string,
    tags: string[]
  ): MemoryEntry {
    return {
      id: randomUUID(),
      content,
      embedding: [],
      created_at: Date.now(),
      source,
      tags,
      category
    };
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
    const entry = this.makeEntry(content, category, source, tags);
    this.memories.set(entry.id, entry);
    return entry;
  }

  async search(query: string, limit = 5): Promise<MemorySearchResult[]> {
    if (this.fault.searchError) throw new Error(this.fault.searchError);
    if (this.fault.empty) return [];
    const results: MemorySearchResult[] = [];
    for (const entry of this.memories.values()) {
      const score = this.scoreFn(query, entry.content);
      if (score > 0) results.push({ entry, score });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async forgetByQuery(query: string, _threshold = 0.8): Promise<number> {
    const matches = await this.search(query, 50);
    for (const { entry } of matches) this.memories.delete(entry.id);
    return matches.length;
  }

  forgetById(id: string): boolean {
    return this.memories.delete(id);
  }

  deleteSource(source: string): number {
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

  /** Directly seed a memory entry without going through store(). */
  seed(partial: Partial<MemoryEntry> & { content: string }): MemoryEntry {
    const entry: MemoryEntry = {
      id: partial.id ?? randomUUID(),
      content: partial.content,
      embedding: partial.embedding ?? [],
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
