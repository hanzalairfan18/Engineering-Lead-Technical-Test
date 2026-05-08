import type { DocumentMetadata, EmbeddedChunk, ScoredChunk } from '../../types';
import { AppError } from '../../utils/errors';
import { cosineSimilarity } from '../similarity/cosine';
import type { VectorStore } from './vector-store';

/**
 * In-process vector store backed by plain Maps.
 *
 * Production systems would replace this with pgvector / Qdrant / Pinecone
 * — but for a take-home and small corpora (<10k chunks) a brute-force scan
 * is correct, predictable, and zero-dependency.
 *
 * Operations are O(N·D) where N is total chunks and D is embedding dimension.
 */
export class InMemoryVectorStore implements VectorStore {
  private readonly chunks = new Map<string, EmbeddedChunk>();
  private readonly documents = new Map<string, DocumentMetadata>();

  insertDocument(meta: DocumentMetadata, chunks: EmbeddedChunk[]): void {
    if (this.documents.has(meta.id)) {
      throw new AppError(
        `Document "${meta.id}" already exists; insert refuses to overwrite.`,
        409,
        'DOCUMENT_ALREADY_EXISTS',
      );
    }
    this.documents.set(meta.id, meta);
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  listDocuments(): DocumentMetadata[] {
    return Array.from(this.documents.values()).sort((a, b) =>
      a.ingestedAt < b.ingestedAt ? 1 : -1,
    );
  }

  size(): { documents: number; chunks: number } {
    return { documents: this.documents.size, chunks: this.chunks.size };
  }

  search(queryEmbedding: number[], topK: number, minScore = 0): ScoredChunk[] {
    if (this.chunks.size === 0) return [];

    const scored: ScoredChunk[] = [];
    for (const chunk of this.chunks.values()) {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= minScore) {
        scored.push({ chunk, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  reset(): void {
    this.chunks.clear();
    this.documents.clear();
  }
}
