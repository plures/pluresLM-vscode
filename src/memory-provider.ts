import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

import { getConfig } from './config';
import { MemoryDB, MemoryEntry, MemorySearchResult } from './memory-db';
import { DualEmbeddings } from './embeddings';

export type MemoryCategory = 'decision' | 'preference' | 'code-pattern' | 'error-fix' | 'architecture' | 'other';

export class MemoryProvider {
  private static _instance: MemoryProvider | null = null;

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
    this.initialized = true;
    this.info(`Initialized DB at ${dbPath}`);
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

  stats(): { totalMemories: number; categories: Record<string, number>; edgeCount: number; lastCaptureTime: number | null } {
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
