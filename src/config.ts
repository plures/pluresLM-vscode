import * as vscode from 'vscode';

export interface SuperlocalmemoryConfig {
  dbPath: string;
  openaiApiKey: string;
  openaiEmbeddingModel: string;
  ollamaEndpoint: string;
  ollamaEmbeddingModel: string;
  autoCapture: boolean;
  maxRecallResults: number;
}

export function getConfig(): SuperlocalmemoryConfig {
  const cfg = vscode.workspace.getConfiguration('superlocalmemory');
  return {
    dbPath: cfg.get<string>('dbPath', ''),
    openaiApiKey: cfg.get<string>('openaiApiKey', ''),
    openaiEmbeddingModel: cfg.get<string>('openaiEmbeddingModel', 'text-embedding-3-small'),
    ollamaEndpoint: cfg.get<string>('ollamaEndpoint', 'http://localhost:11434'),
    ollamaEmbeddingModel: cfg.get<string>('ollamaEmbeddingModel', 'nomic-embed-text'),
    autoCapture: cfg.get<boolean>('autoCapture', true),
    maxRecallResults: cfg.get<number>('maxRecallResults', 5)
  };
}
