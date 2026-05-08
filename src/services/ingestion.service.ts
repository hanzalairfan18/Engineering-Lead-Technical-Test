import type { AppConfig } from '../config/env';
import { chunkText } from '../rag/chunking/fixed-chunker';
import type { InMemoryVectorStore } from '../rag/vectorstore/vector-store';
import type { DocumentMetadata, EmbeddedChunk } from '../types';
import { UpstreamError, ValidationError } from '../utils/errors';
import { newId } from '../utils/ids';
import { normalizeText } from '../utils/text';
import type { EmbeddingService } from './embedding.service';

export interface IngestInput {
  text: string;
  source?: string;
}

export interface IngestResult {
  document: DocumentMetadata;
}

/**
 * Orchestrates the ingestion pipeline:
 *   normalize → chunk → embed (batched) → store
 *
 * The service stays narrow on purpose: it owns the *workflow*, while the
 * actual algorithms live in `rag/` and the I/O lives in dedicated services.
 * That makes each piece testable in isolation.
 */
export class IngestionService {
  constructor(
    private readonly config: AppConfig,
    private readonly embeddings: EmbeddingService,
    private readonly store: InMemoryVectorStore,
  ) {}

  async ingest({ text, source }: IngestInput): Promise<IngestResult> {
    const normalized = normalizeText(text);
    if (normalized.length === 0) {
      throw new ValidationError('Document text is empty after normalization.');
    }

    const documentId = newId();
    const chunks = chunkText(normalized, documentId, {
      size: this.config.CHUNK_SIZE,
      overlap: this.config.CHUNK_OVERLAP,
    });

    if (chunks.length === 0) {
      throw new ValidationError('Document produced no chunks.');
    }

    const vectors = await this.embeddings.embedMany(chunks.map((c) => c.text));
    if (vectors.length !== chunks.length) {
      // Contract violation by the upstream provider — surface as 502, not 500.
      throw new UpstreamError(
        `Embedding count (${vectors.length}) does not match chunk count (${chunks.length})`,
      );
    }

    const embedded: EmbeddedChunk[] = chunks.map((c, i) => ({ ...c, embedding: vectors[i]! }));

    const meta: DocumentMetadata = {
      id: documentId,
      source: source?.trim() || 'inline',
      charCount: normalized.length,
      chunkCount: chunks.length,
      ingestedAt: new Date().toISOString(),
    };

    this.store.upsertDocument(meta, embedded);
    return { document: meta };
  }
}
