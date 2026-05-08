import type { Chunk } from '../../types';
import { newId } from '../../utils/ids';

export interface ChunkOptions {
  size: number;
  overlap: number;
}

/**
 * Fixed-size character chunker with overlap.
 *
 * We use character windows rather than token windows to keep this self-contained
 * (no tokenizer dependency). For text-embedding-3-small, ~500 characters is
 * comfortably under the model's input limit and gives good semantic granularity.
 *
 * Overlap preserves cross-boundary context so a sentence that straddles two
 * chunks still appears intact in at least one of them.
 */
export function chunkText(text: string, documentId: string, options: ChunkOptions): Chunk[] {
  const { size, overlap } = options;
  if (size <= 0) throw new Error('chunk size must be positive');
  if (overlap < 0 || overlap >= size) throw new Error('overlap must be in [0, size)');

  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const stride = size - overlap;
  const chunks: Chunk[] = [];
  let index = 0;

  for (let start = 0; start < trimmed.length; start += stride) {
    const end = Math.min(start + size, trimmed.length);
    const slice = trimmed.slice(start, end);
    chunks.push({
      id: newId(),
      text: slice,
      documentId,
      index: index++,
      startOffset: start,
      endOffset: end,
    });
    if (end === trimmed.length) break;
  }

  return chunks;
}
