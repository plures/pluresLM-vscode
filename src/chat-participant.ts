import * as vscode from 'vscode';
import { IMemoryProvider } from './memory-provider';

function getTextFromRequest(req: unknown): string {
  const r = req as { prompt?: unknown; message?: unknown; text?: unknown } | null;
  return (r?.prompt ?? r?.message ?? r?.text ?? '').toString();
}

function asDisposable(value: unknown): vscode.Disposable {
  if (value && typeof (value as { dispose?: unknown }).dispose === 'function') {
    return value as vscode.Disposable;
  }
  return { dispose: () => void 0 };
}

export function parseSlashCommand(text: string): { command: string; args: string } {
  const t = text.trim();
  if (t.startsWith('/')) {
    const [cmd, ...rest] = t.slice(1).split(/\s+/);
    return { command: cmd.toLowerCase(), args: rest.join(' ') };
  }
  // Support "recall foo" without leading slash.
  const [cmd, ...rest] = t.split(/\s+/);
  return { command: cmd.toLowerCase(), args: rest.join(' ') };
}

export function registerChatParticipant(context: vscode.ExtensionContext, memory: IMemoryProvider): void {
  const chatApi = (vscode as { chat?: { createChatParticipant?: (...args: unknown[]) => unknown } }).chat;
  if (!chatApi?.createChatParticipant) {
    // Older VS Code without chat API.
    return;
  }

  const handler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) => {
    void chatContext;
    if (token.isCancellationRequested) return;

    const text = getTextFromRequest(request);
    const { command, args } = parseSlashCommand(text);

    try {
      switch (command) {
        case 'recall': {
          if (!args.trim()) {
            stream.markdown('Usage: `/recall <query>`');
            return;
          }
          const results = await memory.search(args);
          if (results.length === 0) {
            stream.markdown('No matching memories.');
            return;
          }
          stream.markdown(`Found **${results.length}** memories:\n\n`);
          for (const r of results) {
            const snippet = r.entry.content.length > 500 ? r.entry.content.slice(0, 500) + '\n…' : r.entry.content;
            stream.markdown(`- **${r.entry.category}** (${(r.score * 100).toFixed(1)}%):\n\n  ${snippet.replace(/\n/g, '\n  ')}\n\n`);
          }
          return;
        }
        case 'store': {
          if (!args.trim()) {
            stream.markdown('Usage: `/store <text>`');
            return;
          }
          const entry = await memory.store(args, 'other', 'vscode:chat');
          stream.markdown(`Stored memory: \`${entry.id}\``);
          return;
        }
        case 'forget': {
          if (!args.trim()) {
            stream.markdown('Usage: `/forget <query>`');
            return;
          }
          const deleted = await memory.forgetByQuery(args, 0.85);
          stream.markdown(`Deleted **${deleted}** memories (best-effort).`);
          return;
        }
        case 'stats': {
          const s = memory.stats();
          stream.markdown(`**Superlocalmemory stats**\n\n- Total: ${s.totalMemories}\n- Edges: ${s.edgeCount}\n- Last capture: ${s.lastCaptureTime ? new Date(s.lastCaptureTime).toLocaleString() : '—'}\n`);
          return;
        }
        case 'index': {
          const { indexed, skipped } = await memory.indexWorkspace();
          stream.markdown(`Indexed **${indexed}** files (skipped ${skipped}).`);
          return;
        }
        default: {
          stream.markdown(
            'Commands:\n\n- `/recall <query>`\n- `/store <text>`\n- `/forget <query>`\n- `/stats`\n- `/index`\n'
          );
          return;
        }
      }
    } catch (err) {
      stream.markdown(`Error: ${String(err)}`);
    }
  };

  const participant = (chatApi as { createChatParticipant: (...args: unknown[]) => unknown })
    .createChatParticipant('superlocalmemory.memory', handler);
  context.subscriptions.push(asDisposable(participant));
}
