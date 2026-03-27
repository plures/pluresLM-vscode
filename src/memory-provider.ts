import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

import { getConfig } from './config';
import { MemoryDB, MemoryEntry, MemorySearchResult, ProfileData } from './memory-db';
export type { MemoryEntry, MemorySearchResult };
export type { ProfileData };
import { DualEmbeddings } from './embeddings';
import type { IMemoryProvider, MemoryCategory, StatsResult } from './service.types';
export type { IMemoryProvider, StatsResult };
import { detectDimensionMismatch, recordDimension } from './migration-utils';

export type { MemoryCategory };


export class MemoryProvider implements IMemoryProvider {
  private static _instance: MemoryProvider | null = null;

  /**
   * Factory: returns service-mode or legacy-mode provider based on config.
   * Call this from extension.ts instead of MemoryProvider.getInstance().
   */
  static async create(log?: vscode.OutputChannel): Promise<IMemoryProvider> {
    const cfg = getConfig();
    if (cfg.mode === 'service') {
      // Import lazily to avoid pulling in child_process/spawn at startup in legacy mode
      const { PluresLMServiceClient } = await import('./service-client');
      const client = new PluresLMServiceClient(
        cfg.serviceCommand,
        cfg.serviceArgs,
        cfg.serviceEnv,
        cfg.serviceTimeout,
        (msg) => log?.appendLine(`[plureslm-service] ${msg}`)
      );
      try {
        await client.ensureInitialized();
        log?.appendLine('[superlocalmemory] Service mode active.');
        return client;
      } catch (err) {
        // Clean up any partially-started service process before falling back.
        try {
          client.close();
        } catch {
          // Swallow cleanup errors; the original initialization error is more important.
        }
        log?.appendLine(
          `[superlocalmemory] Service unavailable (${String(err)}). ` +
          `Falling back to legacy local mode. Set "superlocalmemory.mode": "legacy" to suppress this warning.`
        );
        // Explicitly attempt legacy initialization and surface a clearer error if it also fails.
        try {
          return await MemoryProvider.getInstance(log);
        } catch (legacyErr) {
          log?.appendLine(
            `[superlocalmemory] Legacy local mode initialization also failed (${String(legacyErr)}). Extension cannot start.`
          );
          throw new Error(
            `Failed to initialize memory provider in both service and legacy modes. ` +
            `Service error: ${String(err)}; legacy error: ${String(legacyErr)}`,
            { cause: legacyErr }
          );
        }
      }
    }
    return MemoryProvider.getInstance(log);
  }

  static async getInstance(log?: vscode.OutputChannel): Promise<MemoryProvider> {
    if (!this._instance) {
      this._instance = new MemoryProvider(log);
      await this._instance.ensureInitialized();
    }
    return this._instance;
  }

  private db: MemoryDB | null = null;
  private embeddings: DualEmbeddings | null = null;
  private initialized = false;
  private output?: vscode.OutputChannel;

  private constructor(log?: vscode.OutputChannel) {
    this.output = log;
  }

  private info(msg: string): void {
    this.output?.appendLine(`[superlocalmemory] ${msg}`);
  }

  private resolveDbPath(configPath: string): string {
    if (configPath && configPath.trim().length > 0) return configPath;
    return path.join(os.homedir(), '.superlocalmemory', 'vscode.db');
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized && this.db?.isOpen()) return;

    const cfg = getConfig();
    const dbPath = this.resolveDbPath(cfg.dbPath);

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const openaiKey = cfg.openaiApiKey || process.env.OPENAI_API_KEY || '';

    this.embeddings = new DualEmbeddings(
      {
        openaiKey: openaiKey || undefined,
        openaiModel: cfg.openaiEmbeddingModel,
        // Pass through Ollama settings; DualEmbeddings will decide whether to use them
        ollamaEndpoint: cfg.ollamaEndpoint,
        ollamaModel: cfg.ollamaEmbeddingModel,
        dimension: 384  // bge-small-en-v1.5 (384-dim) matching core plugin and MCP server
      },
      {
        info: (m) => this.info(m),
        warn: (m) => this.info(m)
      }
    );

    this.db = new MemoryDB(dbPath, this.embeddings.dimension);
    
    // Check if we need to warn about dimension mismatch
    await this.checkDimensionMigration();
    
    this.initialized = true;
    this.info(`Initialized DB at ${dbPath}`);
  }

  private async checkDimensionMigration(): Promise<void> {
    if (!this.db) return;

    const count = this.db.count();
    if (count === 0) return; // New DB, no migration needed

    const profile = this.db.getProfile();

    // Use shared helper — same logic that migration.test.ts exercises
    const warning = detectDimensionMismatch(profile, this.embeddings?.dimension ?? 384);
    if (warning) {
      this.info(`⚠️  ${warning}`);
    } else if (!profile?.facts?.some((f: unknown) => typeof f === 'string' && f.startsWith('embedding_dimension:'))) {
      // First-time migration: record the current dimension
      const base = profile ?? {
        summary: '',
        facts: [],
        updated_at: Date.now(),
        capture_count: 0
      };
      const updated = recordDimension(base, this.embeddings?.dimension ?? 384);
      // Ensure required fields are present for memory-db.ProfileData
      this.db.setProfile({
        summary: base.summary ?? '',
        facts: updated.facts,
        updated_at: base.updated_at ?? Date.now(),
        capture_count: base.capture_count
      });
    }
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      // ignore
    }
  }

  count(): number {
    return this.db?.count() ?? 0;
  }

  stats(): StatsResult {
    return this.db?.stats() ?? { totalMemories: 0, categories: {}, edgeCount: 0, lastCaptureTime: null };
  }

  async store(content: string, category: MemoryCategory = 'other', source: string = 'vscode', tags: string[] = []): Promise<MemoryEntry> {
    await this.ensureInitialized();
    if (!this.db || !this.embeddings) throw new Error('MemoryProvider not initialized');

    const embedding = await this.embeddings.embed(content);
    const { entry } = await this.db.store(content, embedding, { category, source, tags });
    return entry;
  }

  async search(query: string, limit?: number): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();
    if (!this.db || !this.embeddings) throw new Error('MemoryProvider not initialized');

    const cfg = getConfig();
    const embedding = await this.embeddings.embed(query);
    return this.db.vectorSearch(embedding, limit ?? cfg.maxRecallResults, 0.3);
  }

  async forgetByQuery(query: string, threshold: number = 0.8): Promise<number> {
    await this.ensureInitialized();
    if (!this.db || !this.embeddings) throw new Error('MemoryProvider not initialized');

    const embedding = await this.embeddings.embed(query);
    return this.db.deleteByQuery(embedding, threshold);
  }

  forgetById(id: string): boolean {
    if (!this.db) throw new Error('MemoryProvider not initialized');
    return this.db.delete(id);
  }

  deleteSource(source: string): number {
    if (!this.db) throw new Error('MemoryProvider not initialized');
    return this.db.deleteBySource(source);
  }

  listSources(): Array<{ source: string; count: number }> {
    return this.db?.listSources() ?? [];
  }

  getAllEntries(): Array<Omit<MemoryEntry, 'embedding'>> {
    return this.db?.getAllEntries() ?? [];
  }

  getProfile() {
    return this.db?.getProfile() ?? null;
  }

  clearAll(): void {
    this.db?.clearAll();
  }

  /**
   * Import entries without embeddings (entries stored but not immediately vector-searchable).
   * Uses ID-based upsert so bundle restores are faithful: distinct memories with identical
   * content are all preserved, uniqueness is enforced by ID only.
   */
  importEntries(entries: Array<Omit<MemoryEntry, 'embedding'>>): { imported: number; skipped: number } {
    if (!this.db) throw new Error('MemoryProvider not initialized');
    let imported = 0;
    for (const entry of entries) {
      this.db.storeRawById(entry);
      imported++;
    }
    return { imported, skipped: 0 };
  }

  /**
   * Import entries with embeddings generated on-the-fly (fully searchable after import).
   */
  async importEntriesWithEmbeddings(entries: Array<Omit<MemoryEntry, 'embedding'>>): Promise<{ imported: number; skipped: number }> {
    await this.ensureInitialized();
    if (!this.db || !this.embeddings) throw new Error('MemoryProvider not initialized');
    let imported = 0;
    let skipped = 0;
    for (const entry of entries) {
      try {
        const embedding = await this.embeddings.embed(entry.content);
        const { isDuplicate } = await this.db.store(entry.content, embedding, {
          category: entry.category,
          source: entry.source,
          tags: entry.tags,
          dedupeThreshold: 0.98
        });
        if (isDuplicate) skipped++;
        else imported++;
      } catch (err) {
        this.info(`importEntriesWithEmbeddings: skipped entry ${entry.id}: ${String(err)}`);
        skipped++;
      }
    }
    return { imported, skipped };
  }

  setProfile(profile: ProfileData | null): void {
    if (!this.db || !profile) return;
    this.db.setProfile(profile);
  }

  listByCategory(category: string, limit?: number): Array<Omit<MemoryEntry, 'embedding'>> {
    return this.db?.listByCategory(category, limit) ?? [];
  }

  listBySource(source: string, limit?: number): Array<Omit<MemoryEntry, 'embedding'>> {
    return this.db?.listBySource(source, limit) ?? [];
  }

  listAllTags(): Array<{ tag: string; count: number }> {
    return this.db?.listAllTags() ?? [];
  }

  listByTag(tag: string, limit?: number): Array<Omit<MemoryEntry, 'embedding'>> {
    return this.db?.listByTag(tag, limit) ?? [];
  }

  listByDateRange(start: number, end: number, limit?: number): Array<Omit<MemoryEntry, 'embedding'>> {
    return this.db?.listByDateRange(start, end, limit) ?? [];
  }

  /**
   * Best-effort project indexing: stores file contents (truncated) as memories.
   */
  async indexWorkspace(opts?: { maxFiles?: number; maxCharsPerFile?: number }): Promise<{ indexed: number; skipped: number }>{
    await this.ensureInitialized();
    const folders = vscode.workspace.workspaceFolders ?? [];
    const maxFiles = opts?.maxFiles ?? 200;
    const maxCharsPerFile = opts?.maxCharsPerFile ?? 4000;

    let indexed = 0;
    let skipped = 0;

    const uris: vscode.Uri[] = [];
    for (const folder of folders) {
      const pattern = new vscode.RelativePattern(folder, '**/*');
      // Exclude common noise
      const found = await vscode.workspace.findFiles(
        pattern,
        '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/out/**,**/.venv/**,**/__pycache__/**,**/*.lock,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.webp,**/*.zip,**/*.tar,**/*.gz,**/*.bin,**/*.exe}'
      );
      uris.push(...found);
      if (uris.length >= maxFiles) break;
    }

    for (const uri of uris.slice(0, maxFiles)) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        const truncated = text.length > maxCharsPerFile ? text.slice(0, maxCharsPerFile) + '\n…(truncated)' : text;
        await this.store(
          `File: ${vscode.workspace.asRelativePath(uri)}\n\n${truncated}`,
          'architecture',
          'vscode:index',
          ['project-index']
        );
        indexed++;
      } catch {
        skipped++;
      }
    }

    return { indexed, skipped };
  }
}
