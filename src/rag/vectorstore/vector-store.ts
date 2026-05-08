import type { DocumentMetadata, EmbeddedChunk, ScoredChunk } from '../../types';
import { cosineSimilarity } from '../similarity/cosine';

/**
 * In-process vector store backed by plain arrays.
 *
 * Production systems would replace this with pgvector / Qdrant / Pinecone
 * — but for a take-home and small corpora (<10k chunks) a brute-force scan
 * is correct, predictable, and zero-dependency.
 *
 * Operations are O(N·D) where N is total chunks and D is embedding dimension.
 */
export class InMemoryVectorStore {
  private readonly chunks = new Map<string, EmbeddedChunk>();
  private readonly documents = new Map<string, DocumentMetadata>();

  upsertDocument(meta: DocumentMetadata, chunks: EmbeddedChunk[]): void {
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

  /**
   * Returns the top-K chunks ranked by cosine similarity, optionally filtered
   * by a minimum score threshold. Lower-scoring chunks are dropped before
   * top-K is applied so the caller can safely rely on every returned item
   * being above threshold.
   */
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
