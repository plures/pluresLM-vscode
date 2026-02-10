# Superlocalmemory — AI Memory for Copilot (VS Code Extension)

Persistent, local-first long-term memory for **GitHub Copilot Chat**.

This extension adds:
- `@memory` chat participant (Copilot Chat)
- Language Model Tools for Copilot agent mode (auto-recall / auto-store)
- Memory sidebar (Activity Bar)
- Status bar memory counter

> Privacy: memories are stored locally in a SQLite database. Embeddings are generated via OpenAI **or** a local Ollama fallback. If you configure an OpenAI key, text you embed is sent to OpenAI for embeddings.

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

## Configuration

In Settings:
- `superlocalmemory.dbPath` — path to SQLite DB (default: `~/.superlocalmemory/vscode.db`)
- `superlocalmemory.openaiApiKey` — OpenAI key for embeddings
- `superlocalmemory.openaiEmbeddingModel` — default `text-embedding-3-small`
- `superlocalmemory.ollamaEndpoint` — default `http://localhost:11434`
- `superlocalmemory.ollamaEmbeddingModel` — default `nomic-embed-text`
- `superlocalmemory.autoCapture` — capture a snippet on file saves
- `superlocalmemory.maxRecallResults` — default `5`

You can also set `OPENAI_API_KEY` in your environment.

## Privacy & Data Handling

- All memories are stored locally in SQLite.
- Embeddings require an embedding provider:
  - OpenAI (if configured via settings / env)
  - Ollama fallback (local HTTP)

No data is uploaded anywhere else.

## Comparison with Copilot built-in memory

Copilot memory (when available) is typically scoped and opaque.

Superlocalmemory aims to be:
- **local-first** and inspectable (SQLite)
- **structured** (categories, sources, tags)
- **cross-tool** (same memory core can power other integrations)
- **syncable** (future: P2P / self-hosted)

## License

AGPL-3.0.
