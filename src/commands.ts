import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryProvider, MemoryCategory, MemoryEntry } from './memory-provider';
import { PackManager, isPackCapable } from './pack-manager';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns a PackManager when the provider supports pack operations, or shows an error and returns null. */
function packManager(memory: MemoryProvider): PackManager | null {
  if (!isPackCapable(memory)) {
    vscode.window.showErrorMessage(
      'Pack/bundle operations require legacy mode. Set "superlocalmemory.mode": "legacy" in settings.'
    );
    return null;
  }
  return new PackManager(memory);
}

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

  // ---------------------------------------------------------------------------
  // Export Bundle
  // ---------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.exportBundle', async () => {
      const packs = packManager(memory);
      if (!packs) return;

      const defaultName = `memory-bundle-${todayIso()}.memorybundle.json`;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName)),
        filters: { 'Memory Bundle': ['memorybundle.json', 'json'] },
        title: 'Export Memory Bundle'
      });
      if (!uri) return;

      try {
        const { count } = await packs.exportBundle(uri.fsPath);
        vscode.window.showInformationMessage(`Exported ${count} memories to ${path.basename(uri.fsPath)}.`);
      } catch (err) {
        vscode.window.showErrorMessage(`Export failed: ${String(err)}`);
      }
    })
  );

  // ---------------------------------------------------------------------------
  // Restore Bundle
  // ---------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.restoreBundle', async () => {
      const packs = packManager(memory);
      if (!packs) return;

      const uris = await vscode.window.showOpenDialog({
        filters: { 'Memory Bundle': ['memorybundle.json', 'json'] },
        canSelectMany: false,
        title: 'Select Memory Bundle to Restore'
      });
      if (!uris || uris.length === 0) return;

      const confirm = await vscode.window.showWarningMessage(
        'Restoring a bundle will replace ALL current memories. This cannot be undone.',
        { modal: true },
        'Restore'
      );
      if (confirm !== 'Restore') return;

      try {
        const { restored, skipped } = await packs.restoreBundle(uris[0].fsPath);
        vscode.window.showInformationMessage(
          `Bundle restored: ${restored} memories imported, ${skipped} skipped. ` +
            `Run "Memory: Index Project" to rebuild search vectors.`
        );
        refreshUI?.();
      } catch (err) {
        vscode.window.showErrorMessage(`Restore failed: ${String(err)}`);
      }
    })
  );

  // ---------------------------------------------------------------------------
  // Export Pack
  // ---------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.exportPack', async () => {
      const packs = packManager(memory);
      if (!packs) return;

      const packName = await vscode.window.showInputBox({
        title: 'Export Memory Pack',
        prompt: 'Pack name (used when the pack is imported)',
        placeHolder: 'e.g. react-patterns'
      });
      if (!packName) return;

      const allCategories = ['decision', 'preference', 'code-pattern', 'error-fix', 'architecture', 'other'];
      const picked = await vscode.window.showQuickPick(
        [{ label: 'All categories', picked: true }, ...allCategories.map((c) => ({ label: c, picked: false }))],
        { title: 'Filter by categories (leave on "All" for everything)', canPickMany: true }
      );
      if (!picked) return;

      const categories = picked.some((p) => p.label === 'All categories')
        ? undefined
        : picked.map((p) => p.label);

      const defaultName = `${packName}.memorypack.json`;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName)),
        filters: { 'Memory Pack': ['memorypack.json', 'json'] },
        title: 'Save Memory Pack'
      });
      if (!uri) return;

      try {
        const { count } = await packs.exportPack(packName, uri.fsPath, categories ? { categories } : undefined);
        vscode.window.showInformationMessage(`Exported pack "${packName}" with ${count} memories.`);
      } catch (err) {
        vscode.window.showErrorMessage(`Export pack failed: ${String(err)}`);
      }
    })
  );

  // ---------------------------------------------------------------------------
  // Import Pack
  // ---------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.importPack', async () => {
      const packs = packManager(memory);
      if (!packs) return;

      const uris = await vscode.window.showOpenDialog({
        filters: { 'Memory Pack': ['memorypack.json', 'json'] },
        canSelectMany: false,
        title: 'Select Memory Pack to Import'
      });
      if (!uris || uris.length === 0) return;

      // Parse just the header to show a preview before confirming
      let preview = '';
      try {
        const { default: fs } = await import('node:fs');
        const raw = fs.readFileSync(uris[0].fsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.type !== 'pack') {
          vscode.window.showErrorMessage(
            `This file is a "${parsed.type}", not a pack. Use "Restore Memory Bundle" for bundle files.`
          );
          return;
        }
        preview = `Pack: "${parsed.name}" — ${(parsed.entries as unknown[]).length} entries`;
      } catch {
        preview = path.basename(uris[0].fsPath);
      }

      const confirm = await vscode.window.showInformationMessage(
        `Import ${preview}? Existing memories will not be affected.`,
        { modal: true },
        'Import'
      );
      if (confirm !== 'Import') return;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Importing memory pack…', cancellable: false },
        async () => {
          try {
            const { packName, imported, skipped } = await packs.importPack(uris[0].fsPath);
            vscode.window.showInformationMessage(
              `Pack "${packName}" imported: ${imported} memories added, ${skipped} skipped.`
            );
            refreshUI?.();
          } catch (err) {
            vscode.window.showErrorMessage(`Import pack failed: ${String(err)}`);
          }
        }
      );
    })
  );

  // ---------------------------------------------------------------------------
  // List Packs
  // ---------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.listPacks', async () => {
      const packs = packManager(memory);
      if (!packs) return;

      const installed = packs.listPacks();
      if (installed.length === 0) {
        vscode.window.showInformationMessage('No memory packs installed.');
        return;
      }

      const lines = [
        '# Installed Memory Packs',
        '',
        ...installed.map((p) => `- **${p.name}** — ${p.count} memories  (source: \`${p.source}\`)`)
      ];
      const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' });
      await vscode.window.showTextDocument(doc, { preview: true });
    })
  );

  // ---------------------------------------------------------------------------
  // Uninstall Pack
  // ---------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('superlocalmemory.uninstallPack', async () => {
      const packs = packManager(memory);
      if (!packs) return;

      const installed = packs.listPacks();
      if (installed.length === 0) {
        vscode.window.showInformationMessage('No memory packs installed.');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        installed.map((p) => ({ label: p.name, description: `${p.count} memories`, count: p.count })),
        { title: 'Uninstall Memory Pack' }
      );
      if (!picked) return;

      const confirm = await vscode.window.showWarningMessage(
        `Uninstall pack "${picked.label}"? This will remove ${picked.count} memories.`,
        { modal: true },
        'Uninstall'
      );
      if (confirm !== 'Uninstall') return;

      const deleted = await packs.uninstallPack(picked.label);
      vscode.window.showInformationMessage(`Pack "${picked.label}" uninstalled (${deleted} memories removed).`);
      refreshUI?.();
    })
  );
}
