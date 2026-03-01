import * as vscode from 'vscode';
import { MemoryProvider, MemoryCategory, MemoryEntry } from './memory-provider';

export function registerCommands(context: vscode.ExtensionContext, memory: MemoryProvider, refreshUI?: () => void): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.store', async () => {
      const content = await vscode.window.showInputBox({
        title: 'Store Memory',
        prompt: 'What should I remember?'
      });
      if (!content) return;

      const category = (await vscode.window.showQuickPick(
        ['decision', 'preference', 'code-pattern', 'error-fix', 'architecture', 'other'],
        { title: 'Category' }
      )) as MemoryCategory | undefined;

      const entry = await memory.store(content, category ?? 'other', 'vscode:command');
      vscode.window.showInformationMessage(`Stored memory ${entry.id}`);
      refreshUI?.();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.search', async () => {
      const query = await vscode.window.showInputBox({
        title: 'Search Memory',
        prompt: 'Search query'
      });
      if (!query) return;

      const results = await memory.search(query);
      if (results.length === 0) {
        vscode.window.showInformationMessage('No matching memories.');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        results.map((r) => ({
          label: r.entry.content.slice(0, 80).replace(/\s+/g, ' '),
          description: `${r.entry.category} • ${(r.score * 100).toFixed(1)}%`,
          detail: r.entry.content,
          id: r.entry.id
        })),
        { title: 'Memories', matchOnDescription: true, matchOnDetail: true }
      );

      if (picked?.detail) {
        const doc = await vscode.workspace.openTextDocument({ content: picked.detail, language: 'markdown' });
        await vscode.window.showTextDocument(doc, { preview: true });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.forget', async () => {
      const query = await vscode.window.showInputBox({
        title: 'Forget Memory',
        prompt: 'Search query to forget (will delete close matches)'
      });
      if (!query) return;

      const deleted = await memory.forgetByQuery(query, 0.85);
      vscode.window.showWarningMessage(`Deleted ${deleted} memories (best-effort).`);
      refreshUI?.();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.indexProject', async () => {
      const { indexed, skipped } = await memory.indexWorkspace();
      vscode.window.showInformationMessage(`Indexed ${indexed} files (skipped ${skipped}).`);
      refreshUI?.();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.stats', async () => {
      const s = memory.stats();
      const lines = [
        `Total memories: ${s.totalMemories}`,
        `Edges: ${s.edgeCount}`,
        `Last capture: ${s.lastCaptureTime ? new Date(s.lastCaptureTime).toLocaleString() : '—'}`,
        '',
        'Categories:'
      ];
      for (const [cat, cnt] of Object.entries(s.categories).sort((a, b) => b[1] - a[1])) {
        lines.push(`- ${cat}: ${cnt}`);
      }

      const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' });
      await vscode.window.showTextDocument(doc, { preview: true });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.syncStatus', async () => {
      // TODO: integrate P2P sync from superlocalmemory core.
      vscode.window.showInformationMessage('Sync status: TODO (P2P sync integration pending).');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.browseKnowledge', async () => {
      await vscode.commands.executeCommand('superlocalmemory.knowledgeBrowser.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.viewDocumentDetails', async (entry?: Omit<MemoryEntry, 'embedding'>) => {
      if (!entry) {
        // Called from command palette — run a search and open the result
        const query = await vscode.window.showInputBox({ title: 'View Document Details', prompt: 'Search query' });
        if (!query) return;
        const results = await memory.search(query, 1);
        if (results.length === 0) {
          vscode.window.showInformationMessage('No matching memories.');
          return;
        }
        entry = results[0].entry;
      }

      const lines = [
        `# Memory Details`,
        ``,
        `**ID:** ${entry.id}`,
        `**Category:** ${entry.category}`,
        `**Source:** ${entry.source || '(none)'}`,
        `**Created:** ${new Date(entry.created_at).toLocaleString()}`,
        `**Tags:** ${entry.tags.length > 0 ? entry.tags.join(', ') : '(none)'}`,
        ``,
        `## Content`,
        ``,
        entry.content
      ];
      const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' });
      await vscode.window.showTextDocument(doc, { preview: true });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.deleteSource', async (sourceArg?: string) => {
      const source = sourceArg ?? await vscode.window.showInputBox({
        title: 'Delete Source',
        prompt: 'Source identifier to delete (e.g. vscode:index)'
      });
      if (!source) return;

      const confirm = await vscode.window.showWarningMessage(
        `Delete all memories from source "${source}"?`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') return;

      const deleted = memory.deleteSource(source);
      vscode.window.showInformationMessage(`Deleted ${deleted} memories from source "${source}".`);
      refreshUI?.();
    })
  );
}
