/**
 * PluresLM service client — JSON-RPC 2.0 over stdio (MCP transport).
 *
 * Spawns `plureslm-service` (configurable) as a child process and routes
 * store / search / stats / forget calls through it via MCP tool-call requests.
 *
 * Synchronous list/stats methods return stale-while-revalidate cached data;
 * the cache is refreshed after every mutating call and on demand.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PKG = require('../package.json') as { version: string };

import type {
  IMemoryProvider,
  MemoryCategory,
  StatsResult
} from './memory-provider';
import type { MemoryEntry, MemorySearchResult } from './memory-db';

// ─── JSON-RPC 2.0 types ──────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// ─── Pending request bookkeeping ─────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── PluresLMServiceClient ────────────────────────────────────────────────────

// ─── Connection state ────────────────────────────────────────────────────────

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface ConnectionOptions {
  /** Maximum number of retries after the initial startup/reconnect attempt (total attempts = maxRetries + 1). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff between retries. */
  retryBaseMs?: number;
  /** Maximum backoff delay in ms. */
  retryMaxMs?: number;
  /** Number of retries for individual tool calls on transient errors. */
  callRetries?: number;
}

const DEFAULT_CONN_OPTS: Required<ConnectionOptions> = {
  maxRetries: 3,
  retryBaseMs: 500,
  retryMaxMs: 5000,
  callRetries: 2,
};

export class PluresLMServiceClient implements IMemoryProvider {
  private process: ChildProcess | null = null;
  private nextId = 0;
  private pending = new Map<number, PendingRequest>();
  private lineBuffer = '';
  private _ready = false;
  private _closed = false;
  private _connectionState: ConnectionState = 'disconnected';
  private _lastError: string | null = null;
  private _consecutiveFailures = 0;
  private _reconnecting = false;
  private readonly _connOpts: Required<ConnectionOptions>;

  // Stale-while-revalidate cache for sync methods
  private _stats: StatsResult = { totalMemories: 0, categories: {}, edgeCount: 0, lastCaptureTime: null };
  private _sources: Array<{ source: string; count: number }> = [];
  private _allEntries: Array<Omit<MemoryEntry, 'embedding'>> = [];
  private _cacheWarm = false;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly env: Record<string, string>,
    private readonly timeoutMs: number,
    private readonly log: (msg: string) => void,
    connOpts?: ConnectionOptions
  ) {
    this._connOpts = { ...DEFAULT_CONN_OPTS, ...connOpts };
  }

  /** Current connection state (useful for status bar / UI). */
  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  /** Last error message, if any. */
  get lastError(): string | null {
    return this._lastError;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async ensureInitialized(): Promise<void> {
    if (this._closed) throw new Error('Service client is closed');
    if (this._ready && this.process && !this.process.killed) return;
    await this._startWithRetries();
  }

  /**
   * Attempt to start the service process with exponential-backoff retries.
   * Distinguishes permanent errors (binary not found) from transient ones
   * (process crashed, port conflict) to avoid pointless retries.
   */
  private async _startWithRetries(): Promise<void> {
    const { maxRetries, retryBaseMs, retryMaxMs } = this._connOpts;
    let lastErr: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this._closed) throw new Error('Service client is closed');

      try {
        this._connectionState = attempt === 0 ? 'connecting' : 'reconnecting';
        await this._startProcess();
        // Verify the connection is actually alive with a health check
        await this._healthCheck();
        this._connectionState = 'connected';
        this._consecutiveFailures = 0;
        this._lastError = null;
        return;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        this._lastError = lastErr.message;
        this.log(`Startup attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastErr.message}`);

        // Don't retry permanent errors (binary not found, permission denied)
        if (this._isPermanentError(lastErr)) {
          this._connectionState = 'failed';
          this._consecutiveFailures++;
          throw lastErr;
        }

        if (attempt < maxRetries) {
          const delay = Math.min(retryBaseMs * Math.pow(2, attempt), retryMaxMs);
          this.log(`Retrying in ${delay}ms…`);
          await this._sleep(delay);
        }
      }
    }

    this._connectionState = 'failed';
    this._consecutiveFailures++;
    throw lastErr ?? new Error('Failed to start service after retries');
  }

  /** Returns true for errors that will never self-resolve (no point retrying). */
  private _isPermanentError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return msg.includes('command not found') ||
           msg.includes('enoent') ||
           msg.includes('eacces') ||
           msg.includes('permission denied');
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Lightweight post-initialize check: call `tools/list` to verify the service
   * is actually responding to requests. Fails fast with a clear message.
   */
  private async _healthCheck(): Promise<void> {
    try {
      await this._sendRequest('tools/list', {});
      this.log('Health check passed');
    } catch (err) {
      throw new Error(
        `Service started but failed health check: ${String(err)}. ` +
        `The service process may have exited immediately after spawning.`,
        { cause: err }
      );
    }
  }

  close(): void {
    this._closed = true;
    this._ready = false;
    this._connectionState = 'disconnected';
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this.process && !this.process.killed) {
      try {
        this.process.kill();
      } catch {
        // ignore
      }
    }
    this.process = null;
    this._rejectAll(new Error('Service client closed'));
  }

  // ─── IMemoryProvider — async operations ────────────────────────────────────

  async store(
    content: string,
    category: MemoryCategory = 'other',
    source: string = 'vscode',
    tags: string[] = []
  ): Promise<MemoryEntry> {
    const text = await this._callTool('plureslm_store', { content, category, source, tags });
    void this._scheduleRefresh();
    try {
      const parsed = JSON.parse(text) as MemoryEntry;
      return parsed;
    } catch {
      // Service responded with a non-JSON acknowledgement; synthesise a minimal entry
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
  }

  async search(query: string, limit?: number): Promise<MemorySearchResult[]> {
    const cfg = await import('./config').then(m => m.getConfig());
    const text = await this._callTool('plureslm_search_text', { query, limit: limit ?? cfg.maxRecallResults });
    try {
      return JSON.parse(text) as MemorySearchResult[];
    } catch {
      return [];
    }
  }

  async forgetByQuery(query: string, threshold: number = 0.8): Promise<number> {
    // plureslm_forget is not part of the current MCP surface; attempt it and
    // degrade gracefully if the service returns a tool-not-found error.
    try {
      const text = await this._callTool('plureslm_forget', { query, threshold });
      void this._scheduleRefresh();
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed === 'number') return parsed;
        if (parsed && typeof parsed === 'object' && 'deleted' in parsed) {
          return (parsed as { deleted: number }).deleted;
        }
        return 0;
      } catch {
        return 0;
      }
    } catch (err) {
      this.log(`forgetByQuery not supported by this service version: ${String(err)}`);
      return 0;
    }
  }

  async forgetById(id: string): Promise<boolean> {
    await this._callTool('plureslm_delete', { id });
    void this._scheduleRefresh();
    return true;
  }

  async deleteSource(source: string): Promise<number> {
    const text = await this._callTool('plureslm_delete_source', { source });
    void this._scheduleRefresh();
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'number') return parsed;
      if (parsed && typeof parsed === 'object' && 'deleted' in parsed) {
        return (parsed as { deleted: number }).deleted;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  async indexWorkspace(
    opts?: { maxFiles?: number; maxCharsPerFile?: number }
  ): Promise<{ indexed: number; skipped: number }> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const maxFiles = opts?.maxFiles ?? 200;
    const maxCharsPerFile = opts?.maxCharsPerFile ?? 4000;

    let indexed = 0;
    let skipped = 0;

    const uris: vscode.Uri[] = [];
    for (const folder of folders) {
      const pattern = new vscode.RelativePattern(folder, '**/*');
      const found = await vscode.workspace.findFiles(
        pattern,
        '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/out/**,' +
        '**/.venv/**,**/__pycache__/**,**/*.lock,**/*.png,**/*.jpg,**/*.jpeg,' +
        '**/*.gif,**/*.webp,**/*.zip,**/*.tar,**/*.gz,**/*.bin,**/*.exe}'
      );
      uris.push(...found);
      if (uris.length >= maxFiles) break;
    }

    for (const uri of uris.slice(0, maxFiles)) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        const truncated =
          text.length > maxCharsPerFile
            ? text.slice(0, maxCharsPerFile) + '\n…(truncated)'
            : text;
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

  // ─── IMemoryProvider — sync (cached) ───────────────────────────────────────

  stats(): StatsResult {
    if (!this._cacheWarm) void this._refreshCache();
    return this._stats;
  }

  count(): number {
    return this._stats.totalMemories;
  }

  listSources(): Array<{ source: string; count: number }> {
    if (!this._cacheWarm) void this._refreshCache();
    return this._sources;
  }

  listByCategory(category: string, limit: number = 50): Array<Omit<MemoryEntry, 'embedding'>> {
    if (!this._cacheWarm) void this._refreshCache();
    return this._allEntries
      .filter(e => e.category === category)
      .slice(0, limit);
  }

  listBySource(source: string, limit: number = 50): Array<Omit<MemoryEntry, 'embedding'>> {
    if (!this._cacheWarm) void this._refreshCache();
    return this._allEntries
      .filter(e => e.source === source)
      .slice(0, limit);
  }

  listAllTags(): Array<{ tag: string; count: number }> {
    if (!this._cacheWarm) void this._refreshCache();
    const counts = new Map<string, number>();
    for (const entry of this._allEntries) {
      for (const t of entry.tags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  listByTag(tag: string, limit: number = 50): Array<Omit<MemoryEntry, 'embedding'>> {
    if (!this._cacheWarm) void this._refreshCache();
    return this._allEntries
      .filter(e => (e.tags ?? []).includes(tag))
      .slice(0, limit);
  }

  listByDateRange(
    start: number,
    end: number,
    limit: number = 50
  ): Array<Omit<MemoryEntry, 'embedding'>> {
    if (!this._cacheWarm) void this._refreshCache();
    return this._allEntries
      .filter(e => e.created_at >= start && e.created_at <= end)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }

  // ─── Cache management ──────────────────────────────────────────────────────

  private _refreshScheduled = false;
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private _scheduleRefresh(): void {
    if (this._closed || this._refreshScheduled) return;
    this._refreshScheduled = true;
    // Slight delay so multiple rapid mutations batch into one refresh
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this._refreshScheduled = false;
      if (!this._closed) void this._refreshCache();
    }, 200);
  }

  private async _refreshCache(): Promise<void> {
    if (this._closed) return;
    try {
      await this.ensureInitialized();

      // Stats
      const statsText = await this._callTool('plureslm_stats', {});
      const parsed: unknown = JSON.parse(statsText);
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>;
        this._stats = {
          totalMemories: Number(p['totalMemories'] ?? p['total'] ?? 0),
          categories: (p['categories'] as Record<string, number>) ?? {},
          edgeCount: Number(p['edgeCount'] ?? p['edges'] ?? 0),
          lastCaptureTime: (p['lastCaptureTime'] as number | null) ?? null
        };
      }

      // Full list (best-effort — service may not expose plureslm_list)
      try {
        const listText = await this._callTool('plureslm_list', { limit: 1000 });
        const listParsed: unknown = JSON.parse(listText);
        if (Array.isArray(listParsed)) {
          this._allEntries = listParsed as Array<Omit<MemoryEntry, 'embedding'>>;
        }

        // Re-derive sources from entries
        const sourceCounts = new Map<string, number>();
        for (const e of this._allEntries) {
          const s = e.source ?? '';
          sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1);
        }
        this._sources = [...sourceCounts.entries()]
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count);
      } catch {
        // plureslm_list not available on this service version; that's fine
      }

      this._cacheWarm = true;
    } catch (err) {
      this.log(`Cache refresh failed: ${String(err)}`);
    }
  }

  // ─── MCP transport ─────────────────────────────────────────────────────────

  private async _startProcess(): Promise<void> {
    // Tear down existing process
    if (this.process && !this.process.killed) {
      try { this.process.kill(); } catch { /* ignore */ }
    }
    this.process = null;
    this._ready = false;
    this.lineBuffer = '';
    this._rejectAll(new Error('Service restarting'));

    this.log(`Spawning: ${this.command} ${this.args.join(' ')}`);

    // spawn() itself rarely throws synchronously; ENOENT and permission errors
    // arrive via the child process 'error' event.  We wrap both paths into a
    // single Promise so callers always get a clean rejection with an actionable
    // message when the binary is missing.
    const proc = await new Promise<ChildProcess>((resolve, reject) => {
      let spawnedProc: ChildProcess;
      try {
        spawnedProc = spawn(this.command, this.args, {
          env: { ...process.env, ...this.env },
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (err) {
        reject(new Error(
          `Failed to spawn '${this.command}': ${String(err)}\n` +
          `Make sure plureslm-service is installed: npm install -g plureslm-service`
        ));
        return;
      }

      // Resolve as soon as the process is open (stdout readable) or reject on
      // early error (e.g. ENOENT when the binary doesn't exist).
      const onError = (err: Error): void => {
        spawnedProc.removeListener('spawn', onSpawn);
        const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
        reject(new Error(
          isNotFound
            ? `Command not found: '${this.command}'. ` +
              `Make sure plureslm-service is installed: npm install -g plureslm-service`
            : `Failed to start '${this.command}': ${String(err)}`
        ));
      };
      const onSpawn = (): void => {
        spawnedProc.removeListener('error', onError);
        resolve(spawnedProc);
      };

      spawnedProc.once('error', onError);
      spawnedProc.once('spawn', onSpawn);
    });

    this.process = proc;

    proc.stdout?.setEncoding('utf-8');
    proc.stdout?.on('data', (chunk: string) => {
      this.lineBuffer += chunk;
      let nl: number;
      while ((nl = this.lineBuffer.indexOf('\n')) !== -1) {
        const line = this.lineBuffer.slice(0, nl).trim();
        this.lineBuffer = this.lineBuffer.slice(nl + 1);
        if (line) this._handleLine(line);
      }
    });

    proc.stderr?.setEncoding('utf-8');
    proc.stderr?.on('data', (chunk: string) => {
      this.log(`stderr: ${(chunk as string).trim()}`);
    });

    proc.on('exit', (code, signal) => {
      this.log(`exited: code=${String(code)}, signal=${String(signal)}`);
      this._ready = false;
      this._connectionState = 'disconnected';
      this._rejectAll(new Error(`Service exited (code=${String(code)}, signal=${String(signal)})`));

      // Auto-reconnect on unexpected exit (not from explicit close())
      if (!this._closed) {
        this.log('Unexpected exit — scheduling auto-reconnect…');
        void this._autoReconnect();
      }
    });

    proc.on('error', (err: Error) => {
      this.log(`process error: ${String(err)}`);
      this._ready = false;
      this._connectionState = 'disconnected';
      this._rejectAll(err);
    });

    // MCP initialize handshake
    await this._sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'PluresLM-vscode', version: PKG.version }
    });

    this._ready = true;
    this.log('ready');

    // Warm the cache in background
    void this._refreshCache();
  }

  private _handleLine(line: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return; // Not JSON — ignore (could be service startup banner)
    }

    if (typeof msg.id !== 'number') return; // Notification, not a response

    const req = this.pending.get(msg.id);
    if (!req) return;

    clearTimeout(req.timer);
    this.pending.delete(msg.id);

    if (msg.error) {
      req.reject(new Error(`RPC ${msg.error.code}: ${msg.error.message}`));
    } else {
      req.resolve(msg.result);
    }
  }

  private _rejectAll(err: Error): void {
    for (const [, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(err);
    }
    this.pending.clear();
  }

  private _sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const id = ++this.nextId;
      const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method} (${this.timeoutMs}ms)`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const line = JSON.stringify(msg) + '\n';
      this.process?.stdin?.write(line, (err?: Error | null) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(`stdin write error: ${String(err)}`));
        }
      });
    });
  }

  private async _callTool(name: string, toolArgs: Record<string, unknown>): Promise<string> {
    const { callRetries } = this._connOpts;
    let lastErr: Error | undefined;

    for (let attempt = 0; attempt <= callRetries; attempt++) {
      try {
        await this.ensureInitialized();
        const result = (await this._sendRequest('tools/call', {
          name,
          arguments: toolArgs
        })) as McpToolCallResult;

        if (result.isError === true) {
          throw new Error(`Tool error from ${name}: ${result.content.map(c => c.text).join('')}`);
        }
        return result.content.map(c => c.text).join('');
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));

        // Only retry on transient/connection errors, not on tool-level errors
        const isTransient = this._isTransientCallError(lastErr);
        if (!isTransient || attempt >= callRetries) {
          throw lastErr;
        }
        this.log(`Tool call ${name} failed (attempt ${attempt + 1}/${callRetries + 1}): ${lastErr.message} — retrying…`);
        // Force reconnect before retry
        this._ready = false;
      }
    }

    throw lastErr ?? new Error(`Tool call ${name} failed after retries`);
  }

  /** Returns true for errors that suggest a broken connection rather than a tool-level problem. */
  private _isTransientCallError(err: Error): boolean {
    const msg = err.message.toLowerCase();

    // Never retry once the client is explicitly closed.
    if (msg.includes('service client closed') || msg.includes('service client is closed')) return false;

    return msg.includes('rpc timeout') ||
           msg.includes('timeout') ||
           msg.includes('stdin write error') ||
           msg.includes('service exited') ||
           msg.includes('service restarting');
  }

  private async _autoReconnect(): Promise<void> {
    if (this._closed || this._reconnecting) return;
    this._reconnecting = true;
    try {
      const backoff = Math.min(
        this._connOpts.retryBaseMs * Math.pow(2, this._consecutiveFailures),
        this._connOpts.retryMaxMs
      );
      this.log(`Auto-reconnect in ${backoff}ms (consecutive failures: ${this._consecutiveFailures})`);
      await this._sleep(backoff);
      if (this._closed) return;
      try {
        await this._startWithRetries();
      } catch (err) {
        this.log(`Auto-reconnect failed: ${String(err)}`);
      }
    } finally {
      this._reconnecting = false;
    }
  }
}
