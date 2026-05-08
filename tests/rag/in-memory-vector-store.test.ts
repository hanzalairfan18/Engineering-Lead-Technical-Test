import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryVectorStore } from '../../src/rag/vectorstore/in-memory-vector-store';
import type { DocumentMetadata, EmbeddedChunk } from '../../src/types';
import { AppError } from '../../src/utils/errors';

function makeDoc(id: string): DocumentMetadata {
  return {
    id,
    source: `${id}.txt`,
    charCount: 100,
    chunkCount: 1,
    ingestedAt: new Date().toISOString(),
  };
}

function makeChunk(id: string, docId: string, embedding: number[], text = 'chunk'): EmbeddedChunk {
  return {
    id,
    documentId: docId,
    text,
    index: 0,
    startOffset: 0,
    endOffset: text.length,
    embedding,
  };
}

describe('InMemoryVectorStore', () => {
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  it('returns no results when empty', () => {
    expect(store.search([1, 0], 3)).toEqual([]);
  });

  it('inserts a document and surfaces it via search', () => {
    const doc = makeDoc('doc-a');
    const chunk = makeChunk('c1', doc.id, [1, 0]);
    store.insertDocument(doc, [chunk]);

    const results = store.search([1, 0], 3);
    expect(results).toHaveLength(1);
    expect(results[0].chunk.id).toBe('c1');
    expect(results[0].score).toBeCloseTo(1, 10);
  });

  it('throws on duplicate document id (insert is not upsert)', () => {
    const doc = makeDoc('doc-a');
    store.insertDocument(doc, [makeChunk('c1', doc.id, [1, 0])]);

    expect(() => store.insertDocument(doc, [makeChunk('c2', doc.id, [0, 1])])).toThrow(AppError);
    // Search should still see only the first chunk.
    expect(store.size().chunks).toBe(1);
  });

  it('respects topK and orders by descending score', () => {
    store.insertDocument(makeDoc('d1'), [
      makeChunk('c1', 'd1', [1, 0]),
      makeChunk('c2', 'd1', [0.9, 0.1]),
      makeChunk('c3', 'd1', [0, 1]),
    ]);

    const results = store.search([1, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].chunk.id).toBe('c1');
    expect(results[1].chunk.id).toBe('c2');
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('drops below-threshold hits before applying topK', () => {
    store.insertDocument(makeDoc('d1'), [
      makeChunk('c-near', 'd1', [1, 0]),
      makeChunk('c-far', 'd1', [0, 1]),
    ]);
    // Threshold 0.5 keeps only the near match.
    const results = store.search([1, 0], 5, 0.5);
    expect(results.map((r) => r.chunk.id)).toEqual(['c-near']);
  });

  it('lists documents newest-first', async () => {
    store.insertDocument(makeDoc('d1'), [makeChunk('c1', 'd1', [1, 0])]);
    // Ensure ingestedAt timestamps differ.
    await new Promise((r) => setTimeout(r, 5));
    store.insertDocument(makeDoc('d2'), [makeChunk('c2', 'd2', [0, 1])]);

    const list = store.listDocuments();
    expect(list[0].id).toBe('d2');
    expect(list[1].id).toBe('d1');
  });

  it('reset clears all state', () => {
    store.insertDocument(makeDoc('d1'), [makeChunk('c1', 'd1', [1, 0])]);
    store.reset();
    expect(store.size()).toEqual({ documents: 0, chunks: 0 });
    expect(store.search([1, 0], 3)).toEqual([]);
  });
});
