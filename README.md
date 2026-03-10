# PluresLM — AI Memory for Copilot (VS Code Extension)

Persistent, local-first long-term memory for **GitHub Copilot Chat**.

This extension adds:
- `@memory` chat participant (Copilot Chat)
- Language Model Tools for Copilot agent mode (auto-recall / auto-store)
- Memory sidebar (Activity Bar)
- Status bar memory counter

> **Default mode: service-first.** Starting from v0.3, the extension routes all
> memory reads and writes through `plureslm-service` (MCP/JSON-RPC over stdio).
> This removes the `better-sqlite3` runtime requirement in the default path.
> See [Legacy mode](#legacy-mode) if you want the old local SQLite behaviour.

## Migration from v0.2 (local SQLite) to v0.3 (service-first)

| What changed | v0.2 | v0.3 |
|---|---|---|
| Storage backend | `better-sqlite3` (bundled) | `plureslm-service` (external, MCP) |
| LM tool names | `superlocalmemory_search` / `_store` | `plureslm_search_text` / `plureslm_store` |
| Default mode | local SQLite | service (falls back to legacy if service unavailable) |
| `better-sqlite3` dep | required | optional (only for legacy mode) |

**Old tool names `superlocalmemory_search` / `superlocalmemory_store` remain registered
for one release cycle for backwards compatibility.** They will be removed in v0.4.

### Step-by-step upgrade

1. Install the PluresLM service: `npm install -g plureslm-service`
2. Verify it starts: `plureslm-service --version`
3. Install / reload this extension — it will auto-connect on activation.
4. Update any custom prompts that reference `superlocalmemory_*` to use `plureslm_*`.

### Legacy mode (opt-in)

Set in VS Code settings:
```json
"superlocalmemory.mode": "legacy"
```
This restores the old `better-sqlite3` + Transformers.js local path.
`better-sqlite3` **must** be installed: `npm install better-sqlite3`.

---

## Screenshots

- `@memory` participant in Copilot Chat: *(screenshot placeholder)*
- Memory sidebar: *(screenshot placeholder)*
- Status bar count: *(screenshot placeholder)*

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
→ memory-bundle-2024-01-15.memorybundle.json exported (142 memories)
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

### Copilot agent mode tools
This extension contributes tools declared in `package.json`:
- `plureslm_search_text` *(primary, aligned with MCP surface)*
- `plureslm_store`  *(primary, aligned with MCP surface)*
- `superlocalmemory_search` *(legacy alias, deprecated — remove in v0.4)*
- `superlocalmemory_store` *(legacy alias, deprecated — remove in v0.4)*

## Installation (development)

```bash
npm install
npm run build
```

Then press `F5` in VS Code to run an Extension Development Host.

**Service mode (default):** The extension will try to spawn `plureslm-service`.
If the service is not found it logs a warning and falls back to legacy SQLite mode automatically.

**Legacy mode:** Install `better-sqlite3` and set `"superlocalmemory.mode": "legacy"`.
The bge-small-en-v1.5 model (~33 MB) will be downloaded from Hugging Face on first use.

## Configuration

### Service mode (default)

| Setting | Default | Description |
|---|---|---|
| `superlocalmemory.mode` | `"service"` | `"service"` or `"legacy"` |
| `superlocalmemory.serviceCommand` | `"plureslm-service"` | Command to spawn the service (must be on PATH) |
| `superlocalmemory.serviceArgs` | `[]` | Extra CLI args passed to the service |
| `superlocalmemory.serviceTimeout` | `10000` | RPC timeout in milliseconds |
| `superlocalmemory.serviceEnv` | `{}` | Extra env vars injected into the service process |

### Legacy mode

| Setting | Default | Description |
|---|---|---|
| `superlocalmemory.mode` | `"service"` | Must be changed to `"legacy"` to enable this path |
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

The service binary is not on PATH.  Either:
- Install it: `npm install -g plureslm-service`
- Set `superlocalmemory.serviceCommand` to the full path
- Switch to legacy mode: `"superlocalmemory.mode": "legacy"`

### "RPC timeout"

The service started but didn't respond within `serviceTimeout` ms.
- Increase `superlocalmemory.serviceTimeout` (default 10 000 ms)
- Check the **Output → Superlocalmemory** panel for service stderr

### Service mode — sidebar shows empty

The cache is populated on first `store` or after a short warm-up delay. If the service
doesn't expose `plureslm_list`, the sidebar's "By Source / By Date / By Topic" groups
will remain empty — only **By Category** (derived from stats) is always populated.

### Legacy mode — "better-sqlite3 not installed"

Run `npm install better-sqlite3` inside the extension folder, or switch to service mode.

## Privacy & Data Handling

**Service mode (default):** Data is handled by `plureslm-service`.  Consult that
service's own privacy documentation.

**Legacy mode:** All memories are stored locally in SQLite.  Embeddings are generated
locally using Transformers.js — no data leaves your machine unless you configure OpenAI.

## License

AGPL-3.0.
