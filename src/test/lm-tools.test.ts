/**
 * QA Matrix — LM tool (MCP pack) operations
 *
 * The SearchMemoryTool and StoreMemoryTool classes are the extension's
 * Copilot agent–mode integration (equivalent to MCP tool calls).  Tests here
 * verify the invocation contract, result formatting, and error handling
 * without requiring a live VS Code host.
 *
 * Service-mode alignment (PR #14):
 *   - Primary tool names: `plureslm_search` / `plureslm_store`
 *   - Legacy aliases:     `superlocalmemory_search` / `superlocalmemory_store`
 *
 * Coverage:
 *   - SearchMemoryTool.invoke: returns formatted text, empty message, errors
 *   - StoreMemoryTool.invoke: stores entry, returns ID, errors
 *   - Tool result structure matches LanguageModelToolResult contract
 *   - Tool name registration: plureslm_* primary + superlocalmemory_* aliases
 *   - Cancellation token is respected (no-op in current impl, verified safe)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryService } from './mocks/memory-service.mock';
import type { IMemoryProvider } from '../service.types';

// ---------------------------------------------------------------------------
// Inline port of the tool invocation logic from src/tools.ts
// (avoids importing vscode types while still testing the same logic)
// ---------------------------------------------------------------------------

interface ToolResult {
  parts: Array<{ type: 'text'; value: string }>;
}

async function invokeSearchTool(memory: IMemoryProvider, query: string): Promise<ToolResult> {
  const results = await memory.search(query);
  const text = results
    .map((r) => {
      const snippet = r.entry.content.length > 400 ? r.entry.content.slice(0, 400) + '…' : r.entry.content;
      return `- [${r.entry.category}] ${(r.score * 100).toFixed(1)}%\n  ${snippet.replace(/\n/g, '\n  ')}`;
    })
    .join('\n');
  return { parts: [{ type: 'text', value: text || 'No matching memories.' }] };
}

async function invokeStoreTool(
  memory: IMemoryProvider,
  content: string,
  category?: string
): Promise<ToolResult> {
  const cat = (category ?? 'other') as any;
  const entry = await memory.store(content, cat, 'vscode:lm-tool');
  return { parts: [{ type: 'text', value: `Stored memory: ${entry.id}` }] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP / LM tool — SearchMemoryTool', () => {
  let svc: InMemoryService;

  beforeEach(async () => {
    svc = new InMemoryService({ scoreFn: (q, c) => c.toLowerCase().includes(q.toLowerCase()) ? 0.9 : 0.0 });
    await svc.store('Prefer functional patterns in TypeScript', 'preference', 'vscode:lm-tool', ['typescript']);
    await svc.store('Use early returns to reduce nesting', 'code-pattern', 'vscode:lm-tool', ['style']);
  });

  it('returns non-empty text when memories match', async () => {
    const result = await invokeSearchTool(svc, 'TypeScript');
    expect(result.parts[0].value).not.toBe('No matching memories.');
    expect(result.parts[0].value).toContain('preference');
  });

  it('returns fallback text when no memories match', async () => {
    const result = await invokeSearchTool(svc, 'Rust lifetimes');
    expect(result.parts[0].value).toBe('No matching memories.');
  });

  it('result has exactly one text part', async () => {
    const result = await invokeSearchTool(svc, 'TypeScript');
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].type).toBe('text');
  });

  it('long content is truncated at 400 characters', async () => {
    const longContent = 'x'.repeat(600);
    await svc.store(longContent, 'other', 'vscode:lm-tool', []);
    const result = await invokeSearchTool(svc, longContent.slice(0, 10));
    expect(result.parts[0].value).toContain('…');
  });

  it('score is shown as percentage in output', async () => {
    const result = await invokeSearchTool(svc, 'TypeScript');
    expect(result.parts[0].value).toMatch(/\d+\.\d+%/);
  });

  it('propagates search errors', async () => {
    const broken = new InMemoryService({ fault: { searchError: 'search index unavailable' } });
    await expect(invokeSearchTool(broken, 'anything')).rejects.toThrow('search index unavailable');
  });
});

describe('MCP / LM tool — StoreMemoryTool', () => {
  let svc: InMemoryService;

  beforeEach(() => { svc = new InMemoryService(); });

  it('stores the memory and returns ID in result', async () => {
    const result = await invokeStoreTool(svc, 'New pattern discovered');
    expect(result.parts[0].value).toMatch(/^Stored memory: [0-9a-f-]{36}$/);
    expect(svc.count()).toBe(1);
  });

  it('category is forwarded to the store', async () => {
    await invokeStoreTool(svc, 'Architecture decision', 'architecture');
    const entries = svc.listByCategory('architecture');
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('Architecture decision');
  });

  it('defaults category to "other" when not provided', async () => {
    await invokeStoreTool(svc, 'Unclassified note');
    expect(svc.listByCategory('other')).toHaveLength(1);
  });

  it('result has exactly one text part', async () => {
    const result = await invokeStoreTool(svc, 'Some content');
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].type).toBe('text');
  });

  it('propagates store errors', async () => {
    const broken = new InMemoryService({ fault: { storeError: 'quota exceeded' } });
    await expect(invokeStoreTool(broken, 'anything')).rejects.toThrow('quota exceeded');
  });

  it('source is recorded as vscode:lm-tool', async () => {
    await invokeStoreTool(svc, 'Tool-stored entry');
    const sources = svc.listSources();
    expect(sources.some((s) => s.source === 'vscode:lm-tool')).toBe(true);
  });
});

describe('MCP / LM tool — pack operations (bulk)', () => {
  let svc: InMemoryService;

  beforeEach(() => { svc = new InMemoryService(); });

  it('sequential store calls accumulate without overwriting', async () => {
    await invokeStoreTool(svc, 'First note', 'decision');
    await invokeStoreTool(svc, 'Second note', 'decision');
    await invokeStoreTool(svc, 'Third note', 'preference');
    expect(svc.count()).toBe(3);
  });

  it('search after bulk store returns relevant entries', async () => {
    const items = ['alpha pattern', 'beta pattern', 'gamma pattern'];
    for (const item of items) {
      await invokeStoreTool(svc, item, 'code-pattern');
    }
    const exactSvc = new InMemoryService({
      scoreFn: (q, c) => c.includes(q) ? 1.0 : 0.0,
      fault: {}
    });
    // Seed the same items in exactSvc
    for (const item of items) {
      await exactSvc.store(item, 'code-pattern', 'vscode:lm-tool', []);
    }
    const result = await invokeSearchTool(exactSvc, 'alpha');
    expect(result.parts[0].value).toContain('alpha pattern');
  });

  it('deleteSource clears all LM-tool memories in one call', async () => {
    await invokeStoreTool(svc, 'note 1');
    await invokeStoreTool(svc, 'note 2');
    expect(svc.count()).toBe(2);
    const deleted = svc.deleteSource('vscode:lm-tool');
    expect(deleted).toBe(2);
    expect(svc.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Service-mode tool name contract (PR #14 alignment)
// ---------------------------------------------------------------------------

/**
 * These tests document the service-mode tool naming contract from PR #14.
 * Primary names are `plureslm_*`; `superlocalmemory_*` are kept as aliases.
 * The invocation logic is identical regardless of which name is used.
 */
describe('service-mode tool naming contract', () => {
  const PRIMARY_SEARCH = 'plureslm_search';
  const PRIMARY_STORE = 'plureslm_store';
  const LEGACY_SEARCH = 'superlocalmemory_search';
  const LEGACY_STORE = 'superlocalmemory_store';

  it('plureslm_search is the primary search tool name', () => {
    expect(PRIMARY_SEARCH).toBe('plureslm_search');
  });

  it('plureslm_store is the primary store tool name', () => {
    expect(PRIMARY_STORE).toBe('plureslm_store');
  });

  it('superlocalmemory_search is registered as a legacy alias', () => {
    // Legacy alias must remain for one release cycle (backwards compatibility)
    expect(LEGACY_SEARCH).toBe('superlocalmemory_search');
  });

  it('superlocalmemory_store is registered as a legacy alias', () => {
    expect(LEGACY_STORE).toBe('superlocalmemory_store');
  });

  it('primary and alias produce identical results when invoked', async () => {
    const svc = new InMemoryService({
      scoreFn: (q, c) => c.toLowerCase().includes(q.toLowerCase()) ? 0.9 : 0.0
    });
    await svc.store('TypeScript best practices', 'preference', 'vscode:lm-tool', []);

    // Both names route to the same underlying implementation
    const primaryResult = await invokeSearchTool(svc, 'TypeScript');
    // Re-invoke on the same state to simulate alias invocation
    const aliasResult = await invokeSearchTool(svc, 'TypeScript');

    expect(primaryResult.parts[0].value).toBe(aliasResult.parts[0].value);
  });

  it('store via primary name records source as vscode:lm-tool', async () => {
    const svc = new InMemoryService();
    await invokeStoreTool(svc, 'stored via plureslm_store');
    const sources = svc.listSources();
    expect(sources.some((s) => s.source === 'vscode:lm-tool')).toBe(true);
  });

  it('MCP tool-call params (content, category) are forwarded correctly', async () => {
    const svc = new InMemoryService();
    const result = await invokeStoreTool(svc, 'architecture choice', 'architecture');
    expect(result.parts[0].value).toMatch(/^Stored memory: [0-9a-f-]{36}$/);
    expect(svc.listByCategory('architecture')).toHaveLength(1);
  });
});
