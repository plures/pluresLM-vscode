import * as vscode from 'vscode';
import { MemoryProvider } from './memory-provider';

class SearchMemoryTool implements vscode.LanguageModelTool<{ query: string }> {
  constructor(private memory: MemoryProvider) {}

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
  constructor(private memory: MemoryProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ content: string; category?: string }>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    void token;
    const content = options.input.content;
    const category = (options.input.category ?? 'other') as any;

    const entry = await this.memory.store(content, category, 'vscode:lm-tool');

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Stored memory: ${entry.id}`)
    ]);
  }
}

export function registerLanguageModelTools(context: vscode.ExtensionContext, memory: MemoryProvider): void {
  const lmAny = (vscode as any).lm;
  if (!lmAny?.registerTool) {
    // Older VS Code without LM tools API.
    return;
  }

  context.subscriptions.push(lmAny.registerTool('superlocalmemory_search', new SearchMemoryTool(memory)));
  context.subscriptions.push(lmAny.registerTool('superlocalmemory_store', new StoreMemoryTool(memory)));
}
