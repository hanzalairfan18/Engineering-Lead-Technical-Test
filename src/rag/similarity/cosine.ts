/**
 * Cosine similarity for dense embedding vectors.
 *
 * Returns a score in [-1, 1]. For OpenAI's text-embedding-3-* models the
 * vectors are already L2-normalized, so cosine similarity reduces to a
 * dot product — but we compute it generically here to stay correct for
 * any embedding provider.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
