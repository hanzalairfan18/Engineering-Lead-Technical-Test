import type { DocumentMetadata, EmbeddedChunk, ScoredChunk } from '../../types';

/**
 * Storage contract for embedded document chunks.
 *
 * Services depend on this interface, never on a concrete class. Swapping the
 * in-memory implementation for pgvector / Qdrant / Pinecone is a single-file
 * change at the composition root (`src/app.ts`) — no service edits required.
 */
export interface VectorStore {
  /**
   * Inserts a new document and its embedded chunks.
   *
   * Throws if a document with the same id already exists. Insert is *not* an
   * upsert — overwriting metadata while accumulating duplicate chunks is the
   * kind of silent drift this contract refuses.
   */
  insertDocument(meta: DocumentMetadata, chunks: EmbeddedChunk[]): void;

  /** All known documents, newest-first. */
  listDocuments(): DocumentMetadata[];

  /** Counts of documents and chunks currently stored. */
  size(): { documents: number; chunks: number };

  /**
   * Returns the top-K chunks ranked by cosine similarity, filtered by a
   * minimum score threshold. Implementations must drop below-threshold hits
   * before applying top-K so callers can rely on every returned item being
   * at or above `minScore`.
   */
  search(queryEmbedding: number[], topK: number, minScore?: number): ScoredChunk[];

  /** Removes all stored documents and chunks. */
  reset(): void;
}
