# PluresLM — AI Memory for Copilot (VS Code Extension)

Persistent, local-first long-term memory for **GitHub Copilot Chat**.

PluresLM gives your Copilot sessions a durable memory layer — decisions,
code patterns, error fixes, and architectural context survive across sessions
and workspaces.

| Feature | Description |
|---------|-------------|
| **`@memory` chat participant** | Store and recall memories directly in Copilot Chat |
| **Language Model Tools** | `plureslm_search_text` / `plureslm_store` — Copilot agent mode auto-recall & auto-store |
| **Memory sidebar** | Browse, group, and filter memories from the Activity Bar |
| **Status bar counter** | Live memory count in the VS Code status bar |
| **Packs & Bundles** | Export, share, and restore memory collections |

> **Service-first architecture.** All memory reads and writes route through
> `plureslm-service` (MCP/JSON-RPC over stdio). A legacy SQLite fallback is
> available — see [Legacy mode](#legacy-mode).

## Features

### Copilot Chat participant: `@memory`
Use in Copilot Chat:

- `@memory /recall <query>` — search memory
- `@memory /store <text>` — store a memory
- `@memory /forget <query>` — delete close matches
- `@memory /stats` — show stats
- `@memory /index` — index current workspace (best-effort)

### Commands
- **Memory: Store Memory** (`superlocalmemory.store`)
- **Memory: Search Memory** (`superlocalmemory.search`)
- **Memory: Forget Memory** (`superlocalmemory.forget`)
- **Memory: Index Project** (`superlocalmemory.indexProject`)
- **Memory: Memory Stats** (`superlocalmemory.stats`)

### Pack & Bundle commands

Packs and bundles let you export, share, and restore memory collections.

| Concept | Description |
|---------|-------------|
| **Bundle** | Full backup snapshot of *all* your memories. Use for personal backup/restore. |
| **Pack** | Named, curated subset of memories. Use for sharing knowledge collections across machines or team members. |

#### Export Memory Bundle
`Memory: Export Memory Bundle` (`superlocalmemory.exportBundle`)

Exports all memories to a `.memorybundle.json` file. Use this to back up your memory database before major changes.

```
Command Palette → Memory: Export Memory Bundle
→ Choose save location
→ memory-bundle-2026-08-08.memorybundle.json exported (142 memories)
```

#### Restore Memory Bundle
`Memory: Restore Memory Bundle` (`superlocalmemory.restoreBundle`)

Restores memories from a bundle file, **replacing all current memories**. A confirmation prompt is shown before any data is cleared.

> ⚠️ After restoring, run **Memory: Index Project** to rebuild search vectors for full vector-search capability.

```
Command Palette → Memory: Restore Memory Bundle
→ Select .memorybundle.json file
→ Confirmation prompt: "Restoring a bundle will replace ALL current memories"
→ Bundle restored: 142 memories imported, 0 skipped
```

#### Export Memory Pack
`Memory: Export Memory Pack` (`superlocalmemory.exportPack`)

Exports a named subset of memories to a `.memorypack.json` file. Optionally filter by category.

```
Command Palette → Memory: Export Memory Pack
→ Pack name: react-patterns
→ Filter: code-pattern, decision  (or All categories)
→ Save to react-patterns.memorypack.json
→ Exported pack "react-patterns" with 23 memories
```

#### Import Memory Pack
`Memory: Import Memory Pack` (`superlocalmemory.importPack`)

Imports a pack file additively — your existing memories are untouched. All imported entries are tagged with `pack:<name>` so they can be uninstalled as a unit. Embeddings are generated on import so the new memories are immediately searchable.

```
Command Palette → Memory: Import Memory Pack
→ Select react-patterns.memorypack.json
→ Preview: Pack "react-patterns" — 23 entries
→ Confirmation prompt
→ Pack "react-patterns" imported: 23 memories added, 0 skipped
```

#### List Memory Packs
`Memory: List Memory Packs` (`superlocalmemory.listPacks`)

Opens a Markdown document listing all installed packs with their memory counts.

```
Command Palette → Memory: List Memory Packs
# Installed Memory Packs
- react-patterns — 23 memories  (source: `pack:react-patterns`)
- rust-idioms — 41 memories  (source: `pack:rust-idioms`)
```

#### Uninstall Memory Pack
`Memory: Uninstall Memory Pack` (`superlocalmemory.uninstallPack`)

Removes all memories belonging to a specific pack. A confirmation prompt is shown before deletion.

```
Command Palette → Memory: Uninstall Memory Pack
→ Quick pick: react-patterns (23 memories)
→ Confirmation prompt
→ Pack "react-patterns" uninstalled (23 memories removed)
```

### Copilot agent-mode tools

The extension registers Language Model Tools so Copilot can read and write
memory automatically in agent mode:

| Tool | Purpose |
|------|---------|
| `plureslm_search_text` | Search memories for relevant past context |
| `plureslm_store` | Store a new memory |

## Installation

### From the Marketplace

Search for **PluresLM** in the VS Code Extensions view, or install from
the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=plures.superlocalmemory).

### Development build

```bash
npm install
npm run build
```

Press `F5` in VS Code to launch an Extension Development Host.

**Service mode (default):** The extension spawns `plureslm-service` on activation.
If the service binary is not found, it logs a warning and falls back to legacy mode.

**Legacy mode:** Set `"superlocalmemory.mode": "legacy"`, then install
`better-sqlite3`: `npm install better-sqlite3`. The bge-small-en-v1.5 model
(≈33 MB) downloads from Hugging Face on first use.

## Configuration

### Service mode (default)

| Setting | Default | Description |
|---|---|---|
| `superlocalmemory.mode` | `"service"` | `"service"` or `"legacy"` |
| `superlocalmemory.serviceCommand` | `"plureslm-service"` | Command to spawn the service (must be on `PATH`) |
| `superlocalmemory.serviceArgs` | `[]` | Extra CLI args passed to the service |
| `superlocalmemory.serviceTimeout` | `10000` | RPC timeout in milliseconds |
| `superlocalmemory.serviceEnv` | `{}` | Extra env vars injected into the service process |

### Legacy mode

To use legacy mode, set `"superlocalmemory.mode": "legacy"` and install
`better-sqlite3`.

| Setting | Default | Description |
|---|---|---|
| `superlocalmemory.dbPath` | `""` | SQLite DB path (default: `~/.superlocalmemory/vscode.db`) |
| `superlocalmemory.openaiApiKey` | `""` | OpenAI key to override Transformers.js embeddings |
| `superlocalmemory.openaiEmbeddingModel` | `"text-embedding-3-small"` | OpenAI model |
| `superlocalmemory.ollamaEndpoint` | `"http://localhost:11434"` | Ollama endpoint |
| `superlocalmemory.ollamaEmbeddingModel` | `"nomic-embed-text"` | Ollama model |

### Shared

| Setting | Default | Description |
|---|---|---|
| `superlocalmemory.autoCapture` | `true` | Auto-store a snippet on file save |
| `superlocalmemory.maxRecallResults` | `5` | Max memories returned by search |

## Troubleshooting

### "Failed to spawn 'plureslm-service'"

The service binary is not on `PATH`. Either:
- Install it: `npm install -g plureslm-service`
- Point to the binary: `"superlocalmemory.serviceCommand": "/path/to/plureslm-service"`
- Switch to legacy mode: `"superlocalmemory.mode": "legacy"`

### "RPC timeout"

The service started but didn't respond within the configured timeout.
- Increase `superlocalmemory.serviceTimeout` (default 10 000 ms)
- Check **Output → PluresLM** for service stderr

### Sidebar shows empty

The sidebar populates on the first `store` operation or after a short warm-up.
If the service doesn't expose `plureslm_list`, the **By Source / By Date / By Topic**
groups remain empty — only **By Category** (derived from stats) is always populated.

### Legacy mode — "better-sqlite3 not installed"

Run `npm install better-sqlite3` inside the extension folder, or switch to
service mode (`"superlocalmemory.mode": "service"`).

## Privacy & Data Handling

**Service mode (default):** Data is handled by `plureslm-service`.  Consult that
service's own privacy documentation.

**Legacy mode:** All memories are stored locally in SQLite.  Embeddings are generated
locally using Transformers.js — no data leaves your machine unless you configure OpenAI.

## License


Dual-licensed under [BSL-1.1](LICENSE) and [MIT](LICENSE-MIT). You may choose either license at your option.

