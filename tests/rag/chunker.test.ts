import { describe, expect, it } from 'vitest';
import { chunkText } from '../../src/rag/chunking/fixed-chunker';

describe('chunkText', () => {
  const docId = 'doc-1';

  it('returns no chunks for empty input', () => {
    expect(chunkText('', docId, { size: 10, overlap: 2 })).toEqual([]);
    expect(chunkText('   \n  ', docId, { size: 10, overlap: 2 })).toEqual([]);
  });

  it('produces a single chunk when text is shorter than chunk size', () => {
    const chunks = chunkText('hello world', docId, { size: 100, overlap: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('hello world');
    expect(chunks[0].documentId).toBe(docId);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].startOffset).toBe(0);
    expect(chunks[0].endOffset).toBe(11);
  });

  it('honors size and overlap when chunking longer text', () => {
    const text = 'a'.repeat(25);
    const chunks = chunkText(text, docId, { size: 10, overlap: 3 });
    // stride = 7. Starts at 0, 7, 14, 21. End offset clamps to 25.
    expect(chunks.map((c) => [c.startOffset, c.endOffset])).toEqual([
      [0, 10],
      [7, 17],
      [14, 24],
      [21, 25],
    ]);
    expect(chunks[0].index).toBe(0);
    expect(chunks[3].index).toBe(3);
  });

  it('preserves overlap content between adjacent chunks', () => {
    const text = 'abcdefghij'; // length 10
    const chunks = chunkText(text, docId, { size: 6, overlap: 2 });
    // stride = 4. Windows: [0,6) [4,10).
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe('abcdef');
    expect(chunks[1].text).toBe('efghij');
    // 'ef' is the overlap — appears in both.
    expect(chunks[0].text.endsWith('ef')).toBe(true);
    expect(chunks[1].text.startsWith('ef')).toBe(true);
  });

  it('rejects invalid size or overlap', () => {
    expect(() => chunkText('hi', docId, { size: 0, overlap: 0 })).toThrow();
    expect(() => chunkText('hi', docId, { size: 5, overlap: 5 })).toThrow();
    expect(() => chunkText('hi', docId, { size: 5, overlap: -1 })).toThrow();
  });

  it('assigns unique chunk ids across a document', () => {
    const chunks = chunkText('a'.repeat(50), docId, { size: 10, overlap: 2 });
    const ids = new Set(chunks.map((c) => c.id));
    expect(ids.size).toBe(chunks.length);
  });
});
