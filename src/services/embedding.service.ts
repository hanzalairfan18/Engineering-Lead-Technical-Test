import type OpenAI from 'openai';
import type { AppConfig } from '../config/env';
import { UpstreamError } from '../utils/errors';

/**
 * Embedding service. Wraps the OpenAI embeddings endpoint and exposes two
 * concerns the caller actually cares about:
 *   - embed a single string (the question at /ask time)
 *   - embed a batch of strings (chunks at /ingest time)
 *
 * Batching matters twice over: it amortizes round-trip cost, and it keeps
 * us under OpenAI's per-request input cap (2048 inputs / 300k tokens). Large
 * documents are split into sequential batches so a single ingestion call
 * never exceeds the limit.
 *
 * The OpenAI client is injected so tests can pass a mock without touching
 * module state.
 */
const EMBED_BATCH_SIZE = 1024;

export class EmbeddingService {
  constructor(
    private readonly openai: OpenAI,
    private readonly config: AppConfig,
  ) {}

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.embedMany([text]);
    if (!vector) throw new UpstreamError('OpenAI returned no embedding');
    return vector;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const out: number[][] = [];
    try {
      for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
        const slice = texts.slice(i, i + EMBED_BATCH_SIZE);
        const response = await this.openai.embeddings.create({
          model: this.config.OPENAI_EMBEDDING_MODEL,
          input: slice,
        });
        // Defensive: OpenAI guarantees input order but we sort by index just in case.
        const ordered = response.data
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding);
        out.push(...ordered);
      }
      return out;
    } catch (err) {
      throw new UpstreamError(
        `Embedding request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
