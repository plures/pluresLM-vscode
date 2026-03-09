import * as vscode from 'vscode';

export interface SuperlocalmemoryConfig {
  // Service-first settings (default mode)
  mode: 'service' | 'legacy';
  serviceCommand: string;
  serviceArgs: string[];
  serviceTimeout: number;
  serviceEnv: Record<string, string>;

  // Legacy / local SQLite settings
  dbPath: string;
  openaiApiKey: string;
  openaiEmbeddingModel: string;
  ollamaEndpoint: string;
  ollamaEmbeddingModel: string;

  // Shared
  autoCapture: boolean;
  maxRecallResults: number;
}

export function getConfig(): SuperlocalmemoryConfig {
  const cfg = vscode.workspace.getConfiguration('superlocalmemory');

  // Parse serviceEnv: expect a JSON object string or plain object
  let serviceEnv: Record<string, string> = {};
  const rawEnv = cfg.get<unknown>('serviceEnv');
  if (rawEnv && typeof rawEnv === 'object' && !Array.isArray(rawEnv)) {
    serviceEnv = rawEnv as Record<string, string>;
  }

  return {
    mode: cfg.get<'service' | 'legacy'>('mode', 'service'),
    serviceCommand: cfg.get<string>('serviceCommand', 'plureslm-service'),
    serviceArgs: cfg.get<string[]>('serviceArgs', []),
    serviceTimeout: cfg.get<number>('serviceTimeout', 10_000),
    serviceEnv,

    dbPath: cfg.get<string>('dbPath', ''),
    openaiApiKey: cfg.get<string>('openaiApiKey', ''),
    openaiEmbeddingModel: cfg.get<string>('openaiEmbeddingModel', 'text-embedding-3-small'),
    ollamaEndpoint: cfg.get<string>('ollamaEndpoint', 'http://localhost:11434'),
    ollamaEmbeddingModel: cfg.get<string>('ollamaEmbeddingModel', 'nomic-embed-text'),

    autoCapture: cfg.get<boolean>('autoCapture', true),
    maxRecallResults: cfg.get<number>('maxRecallResults', 5)
  };
}
