/**
 * Pack / Bundle manager — serialises and deserialises memory collections to JSON files.
 *
 * Terminology:
 *   Bundle — a full backup snapshot of all memories (for personal backup / restore).
 *   Pack   — a curated, named subset of memories intended for sharing.
 *
 * File extensions (by convention):
 *   Bundle: <name>.memorybundle.json
 *   Pack:   <name>.memorypack.json
 */

import * as fs from 'node:fs';
import type { ProfileData } from './memory-provider';
import type { MemoryEntry } from './memory-db';

export type PackEntryData = Omit<MemoryEntry, 'embedding'>;

/**
 * Minimal provider interface required by PackManager.
 *
 * MemoryProvider (legacy/SQLite mode) satisfies this interface.
 * PluresLMServiceClient (service mode) does NOT yet implement pack operations;
 * use `isPackCapable()` to check at runtime before constructing PackManager.
 */
export interface IPackProvider {
  ensureInitialized(): Promise<void>;
  getAllEntries(): Array<Omit<MemoryEntry, 'embedding'>>;
  getProfile(): ProfileData | null;
  clearAll(): void;
  importEntries(entries: Array<Omit<MemoryEntry, 'embedding'>>): { imported: number; skipped: number };
  importEntriesWithEmbeddings(entries: Array<Omit<MemoryEntry, 'embedding'>>): Promise<{ imported: number; skipped: number }>;
  setProfile(profile: ProfileData | null): void;
  listSources(): Array<{ source: string; count: number }>;
  deleteSource(source: string): number | Promise<number>;
}

/**
 * Runtime guard — returns true when the provider exposes pack-capable operations.
 * In service mode (post-#14 rebase) these methods are absent; callers should
 * show a user-friendly error and bail out.
 */
export function isPackCapable(provider: unknown): provider is IPackProvider {
  return (
    typeof (provider as IPackProvider).getAllEntries === 'function' &&
    typeof (provider as IPackProvider).clearAll === 'function' &&
    typeof (provider as IPackProvider).importEntries === 'function'
  );
}

export interface MemoryBundleFile {
  version: '1';
  type: 'bundle';
  exportedAt: number;
  entries: PackEntryData[];
  profile: ProfileData | null;
}

export interface MemoryPackFile {
  version: '1';
  type: 'pack';
  name: string;
  description?: string;
  exportedAt: number;
  entries: PackEntryData[];
}

export type AnyPackFile = MemoryBundleFile | MemoryPackFile;

export interface PackInfo {
  name: string;
  source: string;
  count: number;
}

const PACK_SOURCE_PREFIX = 'pack:';

export class PackManager {
  constructor(private readonly memory: IPackProvider) {}

  // ---------------------------------------------------------------------------
  // Bundle operations
  // ---------------------------------------------------------------------------

  /** Export all memories to a bundle file (backup snapshot). */
  async exportBundle(filePath: string): Promise<{ count: number }> {
    await this.memory.ensureInitialized();
    const entries = this.memory.getAllEntries();
    const profile = this.memory.getProfile();

    const bundle: MemoryBundleFile = {
      version: '1',
      type: 'bundle',
      exportedAt: Date.now(),
      entries,
      profile
    };

    fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8');
    return { count: entries.length };
  }

  /**
   * Restore from a bundle file.
   * DESTRUCTIVE — clears the current DB before re-importing.
   * Entries are stored without embeddings; run "Index Project" to rebuild search vectors.
   */
  async restoreBundle(filePath: string): Promise<{ restored: number; skipped: number }> {
    // Parse and validate before touching the DB to prevent data loss on bad input
    const raw = fs.readFileSync(filePath, 'utf-8');
    const bundle = JSON.parse(raw) as AnyPackFile;

    if (bundle.type !== 'bundle') {
      throw new Error(
        `Expected a bundle file (.memorybundle.json) but found type "${bundle.type}". ` +
          `Use "Import Memory Pack" for pack files.`
      );
    }

    const bundleFile = bundle as MemoryBundleFile;
    if (!Array.isArray(bundleFile.entries)) {
      throw new Error('Invalid bundle file: missing or malformed "entries" array.');
    }

    await this.memory.ensureInitialized();
    this.memory.clearAll();

    const result = this.memory.importEntries(bundleFile.entries);

    // Restore profile if present
    if (bundleFile.profile) {
      this.memory.setProfile(bundleFile.profile);
    }

    return { restored: result.imported, skipped: result.skipped };
  }

  // ---------------------------------------------------------------------------
  // Pack operations
  // ---------------------------------------------------------------------------

  /**
   * Export a subset of memories as a named shareable pack.
   * @param packName  Logical name for the pack (used as pack source on import).
   * @param filePath  Destination file path (recommended: <name>.memorypack.json).
   * @param filter    Optional category / tag / source filters.
   */
  async exportPack(
    packName: string,
    filePath: string,
    filter?: {
      categories?: string[];
      sources?: string[];
      tags?: string[];
    }
  ): Promise<{ count: number }> {
    await this.memory.ensureInitialized();
    let entries = this.memory.getAllEntries();

    if (filter?.categories?.length) {
      entries = entries.filter((e) => filter.categories!.includes(e.category));
    }
    if (filter?.sources?.length) {
      entries = entries.filter((e) => filter.sources!.some((s) => e.source.startsWith(s)));
    }
    if (filter?.tags?.length) {
      entries = entries.filter((e) => filter.tags!.some((t) => e.tags.includes(t)));
    }

    const pack: MemoryPackFile = {
      version: '1',
      type: 'pack',
      name: packName,
      exportedAt: Date.now(),
      entries
    };

    fs.writeFileSync(filePath, JSON.stringify(pack, null, 2), 'utf-8');
    return { count: entries.length };
  }

  /**
   * Import a pack file additively — existing memories are preserved.
   * Each imported entry is tagged with `pack:<packName>` as its source so it
   * can later be identified and uninstalled as a unit.
   * Embeddings are re-generated so the entries are immediately searchable.
   */
  async importPack(filePath: string): Promise<{ packName: string; imported: number; skipped: number }> {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const pack = JSON.parse(raw) as AnyPackFile;

    if (pack.type !== 'pack') {
      throw new Error(
        `Expected a pack file (.memorypack.json) but found type "${pack.type}". ` +
          `Use "Restore Memory Bundle" for bundle files.`
      );
    }

    await this.memory.ensureInitialized();

    const packFile = pack as MemoryPackFile;
    const source = `${PACK_SOURCE_PREFIX}${packFile.name}`;

    // Tag all entries with the pack source so they can be uninstalled atomically
    const tagged: PackEntryData[] = packFile.entries.map((e) => ({ ...e, source }));

    // Generate fresh embeddings so entries are immediately vector-searchable
    const result = await this.memory.importEntriesWithEmbeddings(tagged);

    return { packName: packFile.name, ...result };
  }

  /**
   * List all installed packs (memory sources beginning with `pack:`).
   */
  listPacks(): PackInfo[] {
    return this.memory
      .listSources()
      .filter((s) => s.source.startsWith(PACK_SOURCE_PREFIX))
      .map((s) => ({
        name: s.source.slice(PACK_SOURCE_PREFIX.length),
        source: s.source,
        count: s.count
      }));
  }

  /**
   * Remove all memories belonging to a pack.
   * @param packName  The pack name (without the `pack:` prefix).
   */
  async uninstallPack(packName: string): Promise<number> {
    const source = `${PACK_SOURCE_PREFIX}${packName}`;
    return await this.memory.deleteSource(source);
  }
}
