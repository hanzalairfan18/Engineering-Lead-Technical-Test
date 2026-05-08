import type { AppConfig } from '../config/env';
import { buildUserPrompt, NO_CONTEXT_ANSWER, SYSTEM_PROMPT } from '../rag/prompts/qa-prompt';
import type { VectorStore } from '../rag/vectorstore/vector-store';
import type { AskResult } from '../types';
import { preview } from '../utils/text';
import type { EmbeddingService } from './embedding.service';
import type { LLMService } from './llm.service';

/**
 * Orchestrates the retrieval-augmented answer pipeline:
 *   embed question → similarity search → build context → LLM
 *
 * Returns the answer plus enough provenance (chunk IDs + scores + previews)
 * for the caller to render citations or debug retrieval quality.
 */
export class RetrievalService {
  constructor(
    private readonly config: AppConfig,
    private readonly embeddings: EmbeddingService,
    private readonly llm: LLMService,
    private readonly store: VectorStore,
  ) {}

  async ask(question: string): Promise<AskResult> {
    const trimmed = question.trim();
    // Empty-question handling lives in the schema layer; this is a safety net.
    if (trimmed.length === 0) {
      return { answer: NO_CONTEXT_ANSWER, grounded: false, sources: [] };
    }

    if (this.store.size().chunks === 0) {
      return { answer: NO_CONTEXT_ANSWER, grounded: false, sources: [] };
    }

    const queryVector = await this.embeddings.embedOne(trimmed);
    const hits = this.store.search(queryVector, this.config.TOP_K, this.config.SIMILARITY_THRESHOLD);

    if (hits.length === 0) {
      return { answer: NO_CONTEXT_ANSWER, grounded: false, sources: [] };
    }

    const answer = await this.llm.complete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(trimmed, hits),
    });

    return {
      answer,
      grounded: answer.trim() !== NO_CONTEXT_ANSWER,
      sources: hits.map(({ chunk, score }) => ({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        score: Number(score.toFixed(4)),
        preview: preview(chunk.text),
      })),
    };
  }
}
