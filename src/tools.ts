import * as vscode from 'vscode';
import { IMemoryProvider, type MemoryCategory } from './memory-provider';

const memoryCategories = new Set<MemoryCategory>([
  'decision',
  'preference',
  'code-pattern',
  'error-fix',
  'architecture',
  'other',
]);

function asMemoryCategory(value: string | undefined): MemoryCategory {
  if (value && memoryCategories.has(value as MemoryCategory)) return value as MemoryCategory;
  return 'other';
}

function asDisposable(value: unknown): vscode.Disposable {
  if (value && typeof (value as { dispose?: unknown }).dispose === 'function') {
    return value as vscode.Disposable;
  }
  return { dispose: () => void 0 };
}

class SearchMemoryTool implements vscode.LanguageModelTool<{ query: string }> {
  constructor(private memory: IMemoryProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ query: string }>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    void token;
    const query = options.input.query;
    const results = await this.memory.search(query);

    const text = results
      .map((r) => {
        const snippet = r.entry.content.length > 400 ? r.entry.content.slice(0, 400) + '…' : r.entry.content;
        return `- [${r.entry.category}] ${(r.score * 100).toFixed(1)}%\n  ${snippet.replace(/\n/g, '\n  ')}`;
      })
      .join('\n');

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text || 'No matching memories.')]);
  }
}

class StoreMemoryTool implements vscode.LanguageModelTool<{ content: string; category?: string }> {
  constructor(private memory: IMemoryProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ content: string; category?: string }>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    void token;
    const content = options.input.content;
    const category = asMemoryCategory(options.input.category);

    const entry = await this.memory.store(content, category, 'vscode:lm-tool');

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Stored memory: ${entry.id}`)
    ]);
  }
}

export function registerLanguageModelTools(context: vscode.ExtensionContext, memory: IMemoryProvider): void {
  const lmApi = (vscode as { lm?: { registerTool?: (id: string, tool: vscode.LanguageModelTool<unknown>) => unknown } }).lm;
  if (!lmApi?.registerTool) {
    // Older VS Code without LM tools API.
    return;
  }

  // Register under plureslm_* names (current MCP surface)
  context.subscriptions.push(asDisposable(lmApi.registerTool('plureslm_search_text', new SearchMemoryTool(memory))));
  context.subscriptions.push(asDisposable(lmApi.registerTool('plureslm_store', new StoreMemoryTool(memory))));

  // Keep legacy names registered for one release cycle (backwards compatibility)
  context.subscriptions.push(asDisposable(lmApi.registerTool('superlocalmemory_search', new SearchMemoryTool(memory))));
  context.subscriptions.push(asDisposable(lmApi.registerTool('superlocalmemory_store', new StoreMemoryTool(memory))));
}
