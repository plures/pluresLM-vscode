/**
 * Zero-config embedding provider with Transformers.js (primary) + OpenAI/Ollama fallback
 *
 * Uses @huggingface/transformers for local, zero-config embeddings (bge-small-en-v1.5, 384-dim).
 * Keeps OpenAI and Ollama as optional overrides via settings.
 */

import { pipeline } from '@huggingface/transformers';
import OpenAI from 'openai';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  dimension: number;
}

export class OpenAIEmbeddings implements EmbeddingProvider {
  private client: OpenAI;
  dimension: number;

  constructor(private apiKey: string, private model: string = 'text-embedding-3-small', dimension: number = 1536) {
    this.client = new OpenAI({ apiKey });
    this.dimension = dimension;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text
    });
    return response.data[0].embedding;
  }
}

export class OllamaEmbeddings implements EmbeddingProvider {
  dimension: number;

  constructor(
    private endpoint: string = 'http://localhost:11434',
    private model: string = 'nomic-embed-text',
    dimension: number = 768
  ) {
    this.dimension = dimension;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text })
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { embedding: number[] };
    if (data.embedding.length !== this.dimension) {
      this.dimension = data.embedding.length;
    }
    return data.embedding;
  }
}

export class TransformersEmbeddings implements EmbeddingProvider {
  dimension: number = 384; // bge-small-en-v1.5 outputs 384-dim embeddings
  private extractor: any = null; // Pipeline type from @huggingface/transformers
  private initPromise: Promise<void> | null = null;
  private log: (msg: string) => void;

  constructor(
    private model: string = 'Xenova/bge-small-en-v1.5',
    logger?: { info: (msg: string) => void }
  ) {
    this.log = logger?.info ?? (() => {});
  }

  private async ensureInitialized(): Promise<void> {
    if (this.extractor) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.log(`Loading Transformers.js model: ${this.model}...`);
      this.extractor = await pipeline('feature-extraction', this.model);
      this.log(`Model ${this.model} loaded successfully (384-dim)`);
    })();

    return this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    await this.ensureInitialized();
    if (!this.extractor) throw new Error('Transformers.js extractor not initialized');

    // Generate embeddings
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    
    // Convert tensor to array
    const embedding = Array.from(output.data as Float32Array);
    
    if (embedding.length !== this.dimension) {
      throw new Error(`Expected ${this.dimension}-dim embedding, got ${embedding.length}-dim`);
    }
    
    return embedding;
  }
}

export class DualEmbeddings implements EmbeddingProvider {
  private primary: EmbeddingProvider | null = null;
  private fallback: EmbeddingProvider | null = null;
  private default: EmbeddingProvider | null = null;
  private _dimension: number;
  private log: (msg: string) => void;

  get dimension(): number {
    return this._dimension;
  }

  constructor(
    opts: {
      openaiKey?: string;
      openaiModel?: string;
      ollamaEndpoint?: string;
      ollamaModel?: string;
      dimension?: number;
      debug?: boolean;
    },
    logger?: { info: (msg: string) => void; warn: (msg: string) => void }
  ) {
    // Use 384-dim for Transformers.js (bge-small-en-v1.5) as default
    this._dimension = opts.dimension ?? 384;
    this.log = logger?.info ?? (() => {});

    // Check for optional provider overrides
    const apiKey = opts.openaiKey || process.env.OPENAI_API_KEY;
    
    if (apiKey) {
      // OpenAI as primary override
      this.primary = new OpenAIEmbeddings(apiKey, opts.openaiModel, this._dimension);
      this.log('Using OpenAI embeddings (configured via settings)');
    } else if (opts.ollamaEndpoint && opts.ollamaModel) {
      // Ollama as fallback override (if explicitly configured)
      this.fallback = new OllamaEmbeddings(
        opts.ollamaEndpoint,
        opts.ollamaModel,
        this._dimension
      );
      this.log('Using Ollama embeddings (configured via settings)');
    }
    
    // Always initialize Transformers.js as default zero-config option
    this.default = new TransformersEmbeddings('Xenova/bge-small-en-v1.5', logger);
    this.log('Zero-config Transformers.js embeddings initialized (384-dim)');
  }

  async embed(text: string): Promise<number[]> {
    // Try primary (OpenAI if configured)
    if (this.primary) {
      try {
        return await this.primary.embed(text);
      } catch (err) {
        this.log(`Primary provider failed, falling back: ${String(err)}`);
      }
    }

    // Try fallback (Ollama if configured)
    if (this.fallback) {
      try {
        const vec = await this.fallback.embed(text);
        if (vec.length < this._dimension) {
          return [...vec, ...new Array(this._dimension - vec.length).fill(0)];
        }
        return vec.slice(0, this._dimension);
      } catch (err) {
        this.log(`Fallback provider failed, using default: ${String(err)}`);
      }
    }

    // Use default (Transformers.js - always available)
    if (this.default) {
      try {
        return await this.default.embed(text);
      } catch (err) {
        throw new Error(`All embedding providers failed. Last error: ${String(err)}`);
      }
    }

    throw new Error('No embedding provider available');
  }
}
