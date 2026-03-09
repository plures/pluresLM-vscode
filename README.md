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
