/**
 * Domain types shared across services and the API layer.
 *
 * These are intentionally framework-agnostic: nothing in here depends on
 * Fastify, OpenAI SDK, or Zod. That keeps the core RAG pipeline portable
 * and easy to unit-test.
 */

export interface DocumentMetadata {
  /** Unique document identifier (UUID). */
  id: string;
  /** Human-readable source name (filename, URL, or "inline"). */
  source: string;
  /** Total characters in the normalized document text. */
  charCount: number;
  /** Number of chunks produced from this document. */
  chunkCount: number;
  /** ISO timestamp of ingestion. */
  ingestedAt: string;
}

export interface Chunk {
  /** Unique chunk identifier. */
  id: string;
  /** The chunk text (already normalized). */
  text: string;
  /** ID of the document this chunk belongs to. */
  documentId: string;
  /** Position of the chunk within the document, starting at 0. */
  index: number;
  /** Inclusive start offset within the source document. */
  startOffset: number;
  /** Exclusive end offset within the source document. */
  endOffset: number;
}

export interface EmbeddedChunk extends Chunk {
  /** Embedding vector for the chunk text. */
  embedding: number[];
}

export interface ScoredChunk {
  chunk: EmbeddedChunk;
  score: number;
}

export interface AskResult {
  answer: string;
  /** Whether the answer was grounded in retrieved chunks. */
  grounded: boolean;
  sources: Array<{
    chunkId: string;
    documentId: string;
    score: number;
    preview: string;
  }>;
}
