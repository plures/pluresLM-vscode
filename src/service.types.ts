/**
 * IMemoryService — service-mode abstraction for memory operations.
 *
 * Consumers (commands, chat-participant, tools) depend on this interface rather
 * than the concrete MemoryProvider so that tests can inject an in-memory mock
 * without any SQLite or embedding model dependency.
 */

import type { MemoryEntry, MemorySearchResult } from './memory-db';
export type { MemoryEntry, MemorySearchResult };

export type MemoryCategory = 'decision' | 'preference' | 'code-pattern' | 'error-fix' | 'architecture' | 'other';

export interface MemoryStats {
  totalMemories: number;
  categories: Record<string, number>;
  edgeCount: number;
  lastCaptureTime: number | null;
}

export interface IMemoryService {
  /** Store a new memory (or update a near-duplicate). */
  store(content: string, category: MemoryCategory, source: string, tags: string[]): Promise<MemoryEntry>;

  /** Semantic search over stored memories. */
  search(query: string, limit?: number): Promise<MemorySearchResult[]>;

  /** Delete memories whose embedding is within `threshold` of `query`. */
  forgetByQuery(query: string, threshold?: number): Promise<number>;

  /** Delete a single memory by ID. */
  forgetById(id: string): boolean;

  /** Delete all memories from a named source. */
  deleteSource(source: string): number;

  /** Aggregate statistics. */
  stats(): MemoryStats;

  /** Raw memory count. */
  count(): number;

  /** List distinct sources with per-source counts. */
  listSources(): Array<{ source: string; count: number }>;

  /** List memories in a category. */
  listByCategory(category: string, limit?: number): Array<Omit<MemoryEntry, 'embedding'>>;

  /** List memories from a source. */
  listBySource(source: string, limit?: number): Array<Omit<MemoryEntry, 'embedding'>>;

  /** List all tags with occurrence counts. */
  listAllTags(): Array<{ tag: string; count: number }>;

  /** List memories with a given tag. */
  listByTag(tag: string, limit?: number): Array<Omit<MemoryEntry, 'embedding'>>;

  /** List memories in a timestamp range (inclusive). */
  listByDateRange(start: number, end: number, limit?: number): Array<Omit<MemoryEntry, 'embedding'>>;

  /** Index the current VS Code workspace into memory. */
  indexWorkspace(opts?: { maxFiles?: number; maxCharsPerFile?: number }): Promise<{ indexed: number; skipped: number }>;
}
