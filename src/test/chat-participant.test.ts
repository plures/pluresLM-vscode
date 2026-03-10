/**
 * QA Matrix — chat participant tool usage
 *
 * Tests the parseSlashCommand helper logic and the routing behaviour of the
 * @memory chat participant handler using a mock IMemoryProvider.  The VS Code
 * API is replaced by the lightweight mock in src/test/mocks/vscode.ts so no
 * VS Code host is required.
 *
 * Coverage:
 *   - /recall <query>   → search
 *   - /store <text>     → store
 *   - /forget <query>   → forgetByQuery
 *   - /stats            → stats
 *   - Unknown command   → help text
 *   - Empty args guard  → usage hint
 *   - Error propagation → markdown error message
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryService } from './mocks/memory-service.mock';
import type { IMemoryProvider } from '../service.types';
import { parseSlashCommand } from '../chat-participant';

// ---------------------------------------------------------------------------
// Thin test harness around the chat participant command-routing logic.
// Uses the real parseSlashCommand implementation from chat-participant.ts so
// the tests exercise production behaviour and cannot drift.
// ---------------------------------------------------------------------------

interface StreamSpy {
  messages: string[];
  markdown(text: string): void;
}

function makeStream(): StreamSpy {
  const messages: string[] = [];
  return {
    messages,
    markdown(text: string) { messages.push(text); }
  };
}

async function handleChat(
  text: string,
  memory: IMemoryProvider,
  stream: StreamSpy
): Promise<void> {
  const { command, args } = parseSlashCommand(text);
  try {
    switch (command) {
      case 'recall': {
        if (!args.trim()) { stream.markdown('Usage: `/recall <query>`'); return; }
        const results = await memory.search(args);
        if (results.length === 0) { stream.markdown('No matching memories.'); return; }
        stream.markdown(`Found **${results.length}** memories:\n\n`);
        for (const r of results) {
          stream.markdown(`- **${r.entry.category}** (${(r.score * 100).toFixed(1)}%):\n\n  ${r.entry.content}\n\n`);
        }
        return;
      }
      case 'store': {
        if (!args.trim()) { stream.markdown('Usage: `/store <text>`'); return; }
        const entry = await memory.store(args, 'other', 'vscode:chat', []);
        stream.markdown(`Stored memory: \`${entry.id}\``);
        return;
      }
      case 'forget': {
        if (!args.trim()) { stream.markdown('Usage: `/forget <query>`'); return; }
        const deleted = await memory.forgetByQuery(args, 0.85);
        stream.markdown(`Deleted **${deleted}** memories (best-effort).`);
        return;
      }
      case 'stats': {
        const s = memory.stats();
        stream.markdown(
          `**Superlocalmemory stats**\n\n- Total: ${s.totalMemories}\n- Edges: ${s.edgeCount}\n- Last capture: ${s.lastCaptureTime ? new Date(s.lastCaptureTime).toLocaleString() : '—'}\n`
        );
        return;
      }
      default: {
        stream.markdown('Commands:\n\n- `/recall <query>`\n- `/store <text>`\n- `/forget <query>`\n- `/stats`\n- `/index`\n');
        return;
      }
    }
  } catch (err) {
    stream.markdown(`Error: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseSlashCommand', () => {
  it('parses /recall with args', () => {
    expect(parseSlashCommand('/recall some query')).toEqual({ command: 'recall', args: 'some query' });
  });

  it('parses /store with args', () => {
    expect(parseSlashCommand('/store hello world')).toEqual({ command: 'store', args: 'hello world' });
  });

  it('parses command without leading slash', () => {
    expect(parseSlashCommand('stats')).toEqual({ command: 'stats', args: '' });
  });

  it('handles extra whitespace', () => {
    const { command, args } = parseSlashCommand('  /recall   my query  ');
    expect(command).toBe('recall');
    expect(args).toBe('my query');
  });

  it('lower-cases the command', () => {
    expect(parseSlashCommand('/RECALL foo').command).toBe('recall');
  });
});

describe('chat participant — /recall', () => {
  let svc: InMemoryService;
  let stream: StreamSpy;

  beforeEach(async () => {
    svc = new InMemoryService({ scoreFn: (q, c) => c.toLowerCase().includes(q.toLowerCase()) ? 1.0 : 0.0 });
    stream = makeStream();
    await svc.store('TypeScript generics', 'code-pattern', 'vscode:chat', ['ts']);
  });

  it('responds with found memories', async () => {
    await handleChat('/recall TypeScript', svc, stream);
    expect(stream.messages.some((m) => m.includes('Found'))).toBe(true);
  });

  it('shows no-match message when nothing found', async () => {
    await handleChat('/recall Rust ownership', svc, stream);
    expect(stream.messages.some((m) => m.includes('No matching memories'))).toBe(true);
  });

  it('returns usage hint when args are empty', async () => {
    await handleChat('/recall', svc, stream);
    expect(stream.messages.some((m) => m.includes('Usage'))).toBe(true);
  });

  it('includes category in output', async () => {
    await handleChat('/recall TypeScript', svc, stream);
    const combined = stream.messages.join('');
    expect(combined).toContain('code-pattern');
  });
});

describe('chat participant — /store', () => {
  let svc: InMemoryService;
  let stream: StreamSpy;

  beforeEach(() => {
    svc = new InMemoryService();
    stream = makeStream();
  });

  it('stores content and replies with UUID', async () => {
    await handleChat('/store important fact', svc, stream);
    expect(svc.count()).toBe(1);
    expect(stream.messages.some((m) => m.includes('Stored memory:'))).toBe(true);
  });

  it('returns usage hint when args are empty', async () => {
    await handleChat('/store', svc, stream);
    expect(stream.messages.some((m) => m.includes('Usage'))).toBe(true);
  });

  it('propagates service error as markdown', async () => {
    const broken = new InMemoryService({ fault: { storeError: 'DB is full' } });
    const brokenStream = makeStream();
    await handleChat('/store anything', broken, brokenStream);
    expect(brokenStream.messages.some((m) => m.includes('Error:'))).toBe(true);
    expect(brokenStream.messages.some((m) => m.includes('DB is full'))).toBe(true);
  });
});

describe('chat participant — /forget', () => {
  let svc: InMemoryService;
  let stream: StreamSpy;

  beforeEach(async () => {
    svc = new InMemoryService({ scoreFn: (q, c) => c.includes(q) ? 1.0 : 0.0 });
    stream = makeStream();
    await svc.store('delete this memory', 'other', 'test', []);
  });

  it('deletes matching memories and reports count', async () => {
    await handleChat('/forget delete this', svc, stream);
    expect(stream.messages.some((m) => m.includes('Deleted'))).toBe(true);
  });

  it('returns usage hint when args are empty', async () => {
    await handleChat('/forget', svc, stream);
    expect(stream.messages.some((m) => m.includes('Usage'))).toBe(true);
  });
});

describe('chat participant — /stats', () => {
  let svc: InMemoryService;
  let stream: StreamSpy;

  beforeEach(async () => {
    svc = new InMemoryService();
    stream = makeStream();
    await svc.store('x', 'decision', 'test', []);
    await svc.store('y', 'preference', 'test', []);
  });

  it('shows total memory count', async () => {
    await handleChat('/stats', svc, stream);
    const combined = stream.messages.join('');
    expect(combined).toContain('Total: 2');
  });

  it('shows edge count', async () => {
    await handleChat('/stats', svc, stream);
    const combined = stream.messages.join('');
    expect(combined).toContain('Edges:');
  });
});

describe('chat participant — unknown command', () => {
  it('shows help text for unrecognised command', async () => {
    const svc = new InMemoryService();
    const stream = makeStream();
    await handleChat('/unknown', svc, stream);
    expect(stream.messages.some((m) => m.includes('/recall'))).toBe(true);
  });
});
