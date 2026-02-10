import * as vscode from 'vscode';
import { MemoryProvider, MemoryCategory } from './memory-provider';

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
}
