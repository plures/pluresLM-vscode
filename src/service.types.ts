/**
 * IMemoryProvider — unified service-mode abstraction for memory operations.
 *
 * Consumers (commands, chat-participant, tools) depend on this interface rather
 * than any concrete implementation so that tests can inject an in-memory mock
 * without any SQLite, embedding model, or MCP service dependency.
 *
 * Both the legacy SQLite-backed MemoryProvider and the service-first
 * PluresLMServiceClient (MCP/stdio) implement this contract.
 */

import type { MemoryEntry, MemorySearchResult } from './memory-db';
export type { MemoryEntry, MemorySearchResult };

export type MemoryCategory = 'decision' | 'preference' | 'code-pattern' | 'error-fix' | 'architecture' | 'other';

/** Aggregate memory statistics (sync; may be stale-while-revalidate in service mode). */
export interface StatsResult {
  totalMemories: number;
  categories: Record<string, number>;
  edgeCount: number;
  lastCaptureTime: number | null;
}

/** @deprecated Use `StatsResult` — kept for backwards compatibility within this PR cycle. */
export type MemoryStats = StatsResult;

export interface IMemoryProvider {
  // ── Core async operations ─────────────────────────────────────────────────

  /** Store a new memory (or update a near-duplicate). */
  store(content: string, category?: MemoryCategory, source?: string, tags?: string[]): Promise<MemoryEntry>;

  /** Semantic search over stored memories. */
  search(query: string, limit?: number): Promise<MemorySearchResult[]>;

  /** Delete memories whose embedding is within `threshold` of `query`. */
  forgetByQuery(query: string, threshold?: number): Promise<number>;

  /**
   * Delete a single memory by ID.
   * Returns `boolean | Promise<boolean>` — legacy mode is sync; service mode is async.
   */
  forgetById(id: string): boolean | Promise<boolean>;

  /**
   * Delete all memories from a named source.
   * Returns `number | Promise<number>` — legacy mode is sync; service mode is async.
   */
  deleteSource(source: string): number | Promise<number>;

  /** Index the current VS Code workspace into memory. */
  indexWorkspace(opts?: { maxFiles?: number; maxCharsPerFile?: number }): Promise<{ indexed: number; skipped: number }>;

  // ── Stats / counts (sync, cached in service mode) ─────────────────────────

  /** Aggregate statistics. May return stale data in service mode until first cache fill. */
  stats(): StatsResult;

  /** Raw memory count (sync, cached). */
  count(): number;

  // ── List operations (sync, cached in service mode) ────────────────────────

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

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Ensure the provider is ready (opens DB or starts MCP service process). */
  ensureInitialized(): Promise<void>;

  /** Release resources (close DB connection or kill service process). */
  close(): void;
}

/** @deprecated Use `IMemoryProvider` — kept for backwards compatibility within this PR cycle. */
export type IMemoryService = IMemoryProvider;
