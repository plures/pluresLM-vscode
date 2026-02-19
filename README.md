# Superlocalmemory — AI Memory for Copilot (VS Code Extension)

Persistent, local-first long-term memory for **GitHub Copilot Chat**.

This extension adds:
- `@memory` chat participant (Copilot Chat)
- Language Model Tools for Copilot agent mode (auto-recall / auto-store)
- Memory sidebar (Activity Bar)
- Status bar memory counter

> **Zero-config activation**: Install and it works immediately. No API keys or external services required.
>
> Privacy: memories are stored locally in a SQLite database. Embeddings are generated locally using Transformers.js (bge-small-en-v1.5). First activation downloads ~33MB model automatically. Optionally configure OpenAI or Ollama for power users.

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
- `superlocalmemory_search`
- `superlocalmemory_store`

## Installation (development)

```bash
npm install
npm run build
```

Then press `F5` in VS Code to run an Extension Development Host.

**Note**: The bge-small-en-v1.5 model (~33MB) will be downloaded from Hugging Face on first use (when generating the first embedding). Subsequent operations will use the cached model.

## Configuration

In Settings (optional overrides for power users):
- `superlocalmemory.dbPath` — path to SQLite DB (default: `~/.superlocalmemory/vscode.db`)
- `superlocalmemory.openaiApiKey` — OpenAI key to override default Transformers.js embeddings
- `superlocalmemory.openaiEmbeddingModel` — default `text-embedding-3-small`
- `superlocalmemory.ollamaEndpoint` — Ollama endpoint to override default Transformers.js embeddings (default: `http://localhost:11434`)
- `superlocalmemory.ollamaEmbeddingModel` — default `nomic-embed-text`
- `superlocalmemory.autoCapture` — capture a snippet on file saves
- `superlocalmemory.maxRecallResults` — default `5`

By default, the extension uses local Transformers.js embeddings (bge-small-en-v1.5, 384-dim) with zero configuration required.

## Privacy & Data Handling

- All memories are stored locally in SQLite.
- Embeddings are generated **locally** using Transformers.js (bge-small-en-v1.5):
  - Zero-config: works immediately after installation
  - First activation downloads ~33MB model automatically
  - No external API calls or data upload
  - 384-dim embeddings (matching superlocalmemory core plugin and MCP server)
- Optional overrides for power users:
  - OpenAI (via settings / env) - sends text to OpenAI API
  - Ollama (via settings) - requires local Ollama installation

By default, no data leaves your machine.

## Comparison with Copilot built-in memory

Copilot memory (when available) is typically scoped and opaque.

Superlocalmemory aims to be:
- **local-first** and inspectable (SQLite)
- **structured** (categories, sources, tags)
- **cross-tool** (same memory core can power other integrations)
- **syncable** (future: P2P / self-hosted)

## License

AGPL-3.0.
