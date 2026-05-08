import type { AppConfig } from '../src/config/env';
import type { EmbeddingService } from '../src/services/embedding.service';
import type { LLMService } from '../src/services/llm.service';

/**
 * Produces a deterministic synthetic config so tests don't depend on the
 * real `loadConfig()` cache or env state.
 */
export function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    PORT: 0,
    HOST: '127.0.0.1',
    LOG_LEVEL: 'silent',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
    OPENAI_CHAT_MODEL: 'gpt-4.1-mini',
    CHUNK_SIZE: 500,
    CHUNK_OVERLAP: 100,
    TOP_K: 3,
    SIMILARITY_THRESHOLD: 0.35,
    MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
    ...overrides,
  };
}

/**
 * Predictable embedding: encodes the input's lowercase character histogram
 * over the 26 lowercase letters, then L2-normalizes. Strings sharing
 * vocabulary are similar; orthogonal vocabularies are dissimilar — enough
 * to drive realistic top-K selection in tests without calling the network.
 */
export function fakeEmbed(text: string): number[] {
  const v = new Array<number>(26).fill(0);
  for (const ch of text.toLowerCase()) {
    const code = ch.charCodeAt(0) - 97;
    if (code >= 0 && code < 26) v[code] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

export function makeFakeEmbeddings(): EmbeddingService {
  return {
    embedOne: async (text: string) => fakeEmbed(text),
    embedMany: async (texts: string[]) => texts.map(fakeEmbed),
  } as unknown as EmbeddingService;
}

export interface FakeLLMOptions {
  /** Static answer to return; defaults to a canned grounded response. */
  answer?: string;
  /** Capture the most recent prompts for assertions. */
  capture?: { systemPrompt?: string; userPrompt?: string };
}

export function makeFakeLLM(options: FakeLLMOptions = {}): LLMService {
  const answer = options.answer ?? 'Synthetic grounded answer.';
  return {
    complete: async ({ systemPrompt, userPrompt }: { systemPrompt: string; userPrompt: string }) => {
      if (options.capture) {
        options.capture.systemPrompt = systemPrompt;
        options.capture.userPrompt = userPrompt;
      }
      return answer;
    },
  } as unknown as LLMService;
}
