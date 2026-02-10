import * as vscode from 'vscode';

import { getConfig } from './config';
import { MemoryProvider } from './memory-provider';
import { registerCommands } from './commands';
import { MemoryStatusBar } from './status-bar';
import { MemoryTreeDataProvider, StatsViewProvider } from './sidebar';
import { registerChatParticipant } from './chat-participant';
import { registerLanguageModelTools } from './tools';

let memory: MemoryProvider | null = null;
let statusBar: MemoryStatusBar | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Superlocalmemory');
  context.subscriptions.push(output);

  output.appendLine('Activating Superlocalmemory…');

  memory = await MemoryProvider.getInstance(output);

  const refreshAll = () => {
    void statusBar?.refresh();
    treeProvider?.refresh();
    statsProvider?.refresh();
  };

  // Commands
  registerCommands(context, memory, refreshAll);

  // Sidebar views
  const treeProvider = new MemoryTreeDataProvider(memory);
  const statsProvider = new StatsViewProvider(memory);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('superlocalmemory.browser', treeProvider),
    vscode.window.registerTreeDataProvider('superlocalmemory.stats', statsProvider)
  );

  // Status bar
  statusBar = new MemoryStatusBar(memory);
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Chat participant (@memory)
  registerChatParticipant(context, memory);

  // LM tools (Copilot agent mode)
  registerLanguageModelTools(context, memory);

  // Auto-capture
  const cfg = getConfig();
  if (cfg.autoCapture) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(async (doc) => {
        try {
          // Store a small, useful snapshot
          const rel = vscode.workspace.asRelativePath(doc.uri);
          const text = doc.getText();
          const snippet = text.length > 1500 ? text.slice(0, 1500) + '\n…(truncated)' : text;
          await memory?.store(`Saved: ${rel}\n\n${snippet}`, 'code-pattern', 'vscode:autosave', ['autosave']);
          refreshAll();
        } catch (err) {
          output.appendLine(`Auto-capture failed: ${String(err)}`);
        }
      })
    );

    // TODO: terminal output capture - VS Code exposes this as a proposed API in some versions.
    // See: vscode.window.onDidWriteTerminalData (may not exist in stable types).
  }

  output.appendLine('Superlocalmemory activated.');
}

export function deactivate(): void {
  try {
    statusBar?.dispose();
  } catch {
    // ignore
  }
  statusBar = null;

  try {
    memory?.close();
  } catch {
    // ignore
  }
  memory = null;
}
